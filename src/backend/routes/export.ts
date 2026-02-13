import { FastifyInstance } from 'fastify';
import { Document, Sort } from 'mongodb';
import { ConnectionPool, isConnectionError } from '../db/mongodb.js';
import { parseQuery, ParsedCollectionQuery } from '../db/queries.js';
import { collectColumns, buildCsvRow, escapeCsvField } from '../db/csv.js';
import { ExportCsvRequest } from '../../shared/contracts.js';
import { requireConnection, requireDatabase } from './guards.js';

export interface ExportRoutesOptions {
  pool: ConnectionPool;
}

export async function exportRoutes(
  fastify: FastifyInstance,
  opts: ExportRoutesOptions
): Promise<void> {
  const { pool } = opts;

  fastify.post<{ Params: { id: string }; Body: ExportCsvRequest }>(
    '/connections/:id/export-csv',
    async (request, reply) => {
      const { id } = request.params;
      const { query, database } = request.body;

      if (!requireConnection(pool, id, reply)) return;
      const db = requireDatabase(pool, id, database, reply);
      if (!db) return;

      // Parse the query
      const parseResult = parseQuery(query);
      if (!parseResult.ok) {
        return reply.status(400).send({
          error: 'QueryParseError',
          message: parseResult.error.message,
          statusCode: 400,
        });
      }

      const parsed = parseResult.value;

      // Only support find and aggregate for CSV export
      if (
        parsed.type !== 'collection' ||
        (parsed.operation !== 'find' && parsed.operation !== 'aggregate')
      ) {
        return reply.status(400).send({
          error: 'BadRequest',
          message: 'CSV export only supports find and aggregate queries.',
          statusCode: 400,
        });
      }

      const collectionQuery = parsed as ParsedCollectionQuery;
      const collection = db.collection(collectionQuery.collection);

      try {
        // Get total count for the progress header
        let totalCount: number;
        if (collectionQuery.operation === 'find') {
          totalCount = await collection.countDocuments(collectionQuery.filter ?? {});
        } else {
          const pipeline = collectionQuery.pipeline ?? [];
          const countResult = await collection
            .aggregate([...pipeline, { $count: 'total' }])
            .toArray();
          totalCount = countResult[0]?.total ?? 0;
        }

        if (totalCount === 0) {
          reply.header('Content-Type', 'text/csv; charset=utf-8');
          reply.header('X-Total-Count', '0');
          return reply.send('');
        }

        // Open cursor without skip/limit — iterate everything
        let cursor;
        if (collectionQuery.operation === 'find') {
          const findOptions: { projection?: Document; sort?: Sort } = {};
          if (collectionQuery.projection) findOptions.projection = collectionQuery.projection;
          if (collectionQuery.sort) findOptions.sort = collectionQuery.sort as Sort;
          cursor = collection.find(collectionQuery.filter ?? {}, findOptions);
        } else {
          cursor = collection.aggregate(collectionQuery.pipeline ?? []);
        }

        // Buffer first batch to collect all column keys
        const BUFFER_SIZE = 100;
        const buffer = [];
        for (let i = 0; i < BUFFER_SIZE; i++) {
          const doc = await cursor.next();
          if (!doc) break;
          buffer.push(doc);
        }

        if (buffer.length === 0) {
          await cursor.close();
          reply.header('Content-Type', 'text/csv; charset=utf-8');
          reply.header('X-Total-Count', '0');
          return reply.send('');
        }

        const columns = collectColumns(buffer);

        // Hijack the response to stream directly
        await reply.hijack();
        const raw = request.raw.socket;

        // Write HTTP response headers manually
        const headers = [
          'HTTP/1.1 200 OK',
          'Content-Type: text/csv; charset=utf-8',
          `X-Total-Count: ${totalCount}`,
          'Transfer-Encoding: chunked',
          'Cache-Control: no-cache',
          'Connection: keep-alive',
          `Access-Control-Allow-Origin: ${request.headers.origin ?? '*'}`,
          'Access-Control-Expose-Headers: X-Total-Count',
          '',
          '',
        ].join('\r\n');

        raw.write(headers);

        // Helper to write a chunk in HTTP chunked transfer encoding
        function writeChunk(data: string): boolean {
          const encoded = Buffer.from(data, 'utf-8');
          const hex = encoded.length.toString(16);
          return raw.write(`${hex}\r\n`) && raw.write(encoded) && raw.write('\r\n');
        }

        // Track client disconnection
        let clientDisconnected = false;
        request.raw.on('close', () => {
          clientDisconnected = true;
        });

        // Write CSV header
        const headerRow = columns.map(escapeCsvField).join(',') + '\n';
        writeChunk(headerRow);

        // Write buffered rows
        for (const doc of buffer) {
          if (clientDisconnected) break;
          writeChunk(buildCsvRow(doc, columns) + '\n');
        }

        // Stream remaining rows from cursor
        if (!clientDisconnected) {
          let doc = await cursor.next();
          while (doc && !clientDisconnected) {
            writeChunk(buildCsvRow(doc, columns) + '\n');
            doc = await cursor.next();
          }
        }

        // End chunked encoding
        raw.write('0\r\n\r\n');
        raw.end();
        await cursor.close();
      } catch (err) {
        if (isConnectionError(err)) {
          await pool.forceDisconnect(id);
        }
        // If we haven't hijacked yet, send a normal error response
        if (!reply.sent) {
          const error = err as Error;
          return reply.status(500).send({
            error: 'ExportError',
            message: error.message ?? 'Export failed',
            statusCode: 500,
            ...(isConnectionError(err) ? { isConnected: false } : {}),
          });
        }
        // If already streaming, just close the connection
        request.raw.socket.destroy();
      }
    }
  );
}

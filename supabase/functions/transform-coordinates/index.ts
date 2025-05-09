// supabase/functions/transform-coordinates/index.ts
/// <reference types="https://deno.land/x/deno_types@v1.0.0/index.d.ts" />
// @deno-types="https://deno.land/x/edge_runtime@v0.0.4/worker.d.ts"
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getLogger, setup, LogRecord } from "std/log/mod.ts";
import proj4 from 'https://esm.sh/proj4@2.9.0';

// Type definitions for Deno globals
declare global {
  const Deno: {
    env: {
      get(key: string): string | undefined;
    };
    readFile(path: string): Promise<Uint8Array>;
    errors: {
      NotFound: typeof Error;
    };
  };
}

// Type definitions
type Coordinate = [number, number] | [number, number, number];

interface RequestPayload {
  coordinates?: Coordinate[];
}

interface ErrorResponse {
  error: string;
  details?: string;
  received_payload?: unknown;
  received_body?: string;
}

interface SuccessResponse {
  transformed: Coordinate[];
}

// Initialize structured logging
await setup({
  handlers: {
    console: new class extends EventTarget {
      handle(record: LogRecord) {
        const msg = {
          level: record.levelName,
          msg: record.msg,
          ...record.args[0]
        };
        if (record.level >= 30) { // Warning and above
          console.warn(JSON.stringify(msg));
        } else {
          console.debug(JSON.stringify(msg));
        }
      }
    },
  },
  loggers: {
    default: {
      level: "DEBUG",
      handlers: ["console"],
    },
  },
});

const logger = getLogger();
const SOURCE = 'TransformCoordinates';

// Configuration
const relativeGridPath = './data/chgeo2004_LV95.gtx';
const gridKey = 'chgeo04';
let proj4Ready = false;
let setupErrorMsg: string | null = null;

// Debug logging function that only logs in development
const debug = (message: string, data?: unknown) => {
  if (Deno.env.get('DENO_ENV') === 'development') {
    console.warn(`[DEBUG] ${message}`, data ? JSON.stringify(data) : '');
  }
};

async function setupProj4(): Promise<void> {
  debug('[SETUP] Starting setupProj4...');
  try {
    // Define the Swiss LV95 projection
    proj4.defs('EPSG:2056', '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs');

    // Define Web Mercator (EPSG:3857)
    proj4.defs('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs');

    try {
      const gridDataBuffer = await Deno.readFile(relativeGridPath);
      // Convert Uint8Array to ArrayBuffer for proj4
      const arrayBuffer = gridDataBuffer.buffer.slice(
        gridDataBuffer.byteOffset,
        gridDataBuffer.byteOffset + gridDataBuffer.byteLength
      );
      proj4.nadgrid(gridKey, arrayBuffer);
      debug('[SETUP] Successfully loaded grid data');
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        debug('[SETUP] Grid file not found, continuing without height transformation');
      } else {
        throw error;
      }
    }

    proj4Ready = true;
    debug('[SETUP] Proj4 setup completed successfully');
  } catch (error) {
    setupErrorMsg = `Failed to setup proj4: ${error instanceof Error ? error.message : String(error)}`;
    debug('[SETUP] Error during setup', { error: setupErrorMsg });
    throw error;
  }
}

// Initialize proj4 on module load
await setupProj4();

logger.info("Transform Coordinates function starting", { source: SOURCE });

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();
  logger.debug("Received request", { source: SOURCE, requestId });
  
  await setupProj4();
  logger.debug("Setup status", { source: SOURCE, requestId, proj4Ready });

  if (req.method === 'OPTIONS') {
    logger.debug("Handling OPTIONS request", { source: SOURCE, requestId });
    return new Response('ok', { 
      headers: { 
        'Access-Control-Allow-Origin': '*', 
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' 
      } 
    });
  }

  if (!proj4Ready) {
    logger.error("Proj4 setup failed", { 
      source: SOURCE, 
      requestId,
      error: setupErrorMsg 
    });
    
    const response: ErrorResponse = {
      error: 'Internal Server Error: Projection setup failed.',
      details: setupErrorMsg ?? undefined
    };
    
    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    let requestBodyText = '';
    let payload: RequestPayload;

    try {
      if (req.body === null) {
        throw new Error('Request body is missing');
      }
      requestBodyText = await req.text();
      payload = JSON.parse(requestBodyText);
    } catch (parseError) {
      logger.error("Parse error", {
        source: SOURCE,
        requestId,
        error: parseError instanceof Error ? parseError.message : String(parseError),
        receivedBody: requestBodyText
      });

      const response: ErrorResponse = {
        error: 'Invalid JSON format',
        details: parseError instanceof Error ? parseError.message : String(parseError),
        received_body: requestBodyText
      };

      return new Response(JSON.stringify(response), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    const coordinates = payload?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      logger.warn("Invalid input", { 
        source: SOURCE, 
        requestId,
        payload 
      });

      const response: ErrorResponse = {
        error: 'Invalid input: "coordinates" key missing or empty.',
        received_payload: payload
      };

      return new Response(JSON.stringify(response), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    const transformedCoordinates = coordinates
      .map((coord): Coordinate | null => {
        if (!Array.isArray(coord) || coord.length < 2) {
          logger.warn("Invalid coordinate entry", { 
            source: SOURCE,
            requestId,
            coord 
          });
          return null;
        }

        try {
          if (typeof proj4 !== 'function') {
            logger.error("proj4 function unavailable", {
              source: SOURCE,
              requestId
            });
            throw new Error("proj4 is not available.");
          }

          logger.debug("Processing coordinate", { 
            source: SOURCE,
            requestId,
            input: coord 
          });

          const result = proj4('EPSG:2056', 'EPSG:3857', coord) as Coordinate;
          
          logger.debug("Transformation complete", { 
            source: SOURCE,
            requestId,
            input: coord,
            result 
          });

          if (coord.length >= 3 && result.length >= 3 && coord[2] === result[2]) {
            logger.warn("Height unchanged", { 
              source: SOURCE,
              requestId,
              coord,
              result 
            });
          }
          
          return result;

        } catch (transformError) {
          logger.error("Transformation error", {
            source: SOURCE,
            requestId,
            coord,
            error: transformError instanceof Error ? {
              name: transformError.name,
              message: transformError.message,
              stack: transformError.stack
            } : transformError
          });
          return null;
        }
      })
      .filter((c): c is Coordinate => c !== null);

    logger.debug("Transformation successful", { 
      source: SOURCE,
      requestId,
      count: transformedCoordinates.length 
    });

    const response: SuccessResponse = { 
      transformed: transformedCoordinates 
    };

    return new Response(JSON.stringify(response), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      status: 200,
    });

  } catch (error) {
    logger.error("Unhandled error", {
      source: SOURCE,
      requestId,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error
    });

    const response: ErrorResponse = {
      error: error instanceof Error ? error.message : 'Internal Server Error'
    };

    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
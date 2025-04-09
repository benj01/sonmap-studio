// supabase/functions/transform-coordinates/index.ts
/// <reference types="https://deno.land/x/deno_types@v1.0.0/index.d.ts" />
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import proj4 from 'https://esm.sh/proj4@2.9.0';

// Simple relative path from where the script *should* be running
const relativeGridPath = './data/chgeo2004_LV95.gtx';
const gridKey = 'chgeo04';
let proj4Ready = false;
let setupErrorMsg: string | null = null;

async function setupProj4() {
  console.log("[SETUP] Starting setupProj4...");
  try {
    // --- TRYING DIRECT RELATIVE PATH READ ---
    console.log(`[SETUP] Attempting to read grid file directly using relative path: ${relativeGridPath}`);
    const gridDataUint8Array = await Deno.readFile(relativeGridPath); // Use simple relative path
    const gridDataBuffer = gridDataUint8Array.buffer;
    console.log(`[SETUP] Successfully read grid file, size: ${gridDataBuffer.byteLength} bytes.`);

    // --- Register grid ---
    if (typeof proj4.nadgrid !== 'function') {
      throw new Error("[SETUP] proj4.nadgrid function is not available!");
    }
    proj4.nadgrid(gridKey, gridDataBuffer);
    console.log(`[SETUP] Registered grid data with key: ${gridKey}`);

    // --- Define projections ---
    proj4.defs('EPSG:2056+LHN95',
        '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 ' +
        '+x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 ' +
        '+units=m +vunits=m +no_defs ' +
        // Using @key syntax, still hoping this works for geoidgrids
        `+geoidgrids=@${gridKey}`
    );
    proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
    console.log("[SETUP] proj4 definitions set up successfully using pre-loaded grid.");

    proj4Ready = true;
    console.log("[SETUP] Setup complete. proj4Ready = true");

  } catch (error) {
    setupErrorMsg = error instanceof Error ? error.message : String(error);
    console.error("---!!! FATAL SETUP ERROR !!!---");
    console.error(`[SETUP_ERROR] Message: ${setupErrorMsg}`);
    // Log specific details if it's a file read error
     if (error instanceof Deno.errors.NotFound) {
         console.error(`[SETUP_ERROR] Deno.readFile failed with relative path: ${relativeGridPath}`);
     }
    try { console.error("[SETUP_ERROR] Full Error Object:", JSON.stringify(error, Object.getOwnPropertyNames(error))); } catch { /* ignore stringify errors */ }
    console.error("---!!! END FATAL SETUP ERROR !!!---");
    proj4Ready = false;
  }
}

// --- Call setup asynchronously ---
// We don't await here, the serve function will check the proj4Ready flag
const setupPromise = setupProj4();

console.log('[MAIN] Transform Coordinates function starting...');

serve(async (req: Request) => {
  console.log("[REQUEST] Received request. Waiting for setupPromise...");
  await setupPromise;
  console.log(`[REQUEST] Setup complete. proj4Ready state: ${proj4Ready}`);

  if (req.method === 'OPTIONS') {
      console.log("[REQUEST] Handling OPTIONS request.");
      return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } });
  }

  if (!proj4Ready) {
      console.error("[REQUEST] Proj4 setup failed, returning 500.");
      return new Response(JSON.stringify({
          error: 'Internal Server Error: Projection setup failed.',
          details: setupErrorMsg // Include the stored error message
      }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
      });
  }

  console.log("[REQUEST] Proj4 ready. Proceeding with request processing...");
  try {
    // 2. Auth check (optional)
    // ...

    // 3. Parse request body (using robust version from before)
    let requestBodyText: string = ''; // Initialize
    let payload: { coordinates?: number[][] };

    try {
        if (req.body === null) {
          throw new Error('Request body is missing');
        }
        requestBodyText = await req.text();
        payload = JSON.parse(requestBodyText);
    } catch (parseError) {
        console.error(`Failed to parse request body JSON. Raw text was: "${requestBodyText}"`, parseError);
        return new Response(JSON.stringify({ error: 'Invalid JSON format', details: parseError.message, received_body: requestBodyText }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const coordinates = payload?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
        return new Response(JSON.stringify({ error: 'Invalid input: "coordinates" key missing or empty.', received_payload: payload }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 4. Perform transformation (with previous logging additions)
    const transformedCoordinates = coordinates.map((coord: number[]) => {
        if (!Array.isArray(coord) || coord.length < 3) {
            console.warn(`Skipping invalid coordinate entry: ${JSON.stringify(coord)}`);
            return null;
        }
        try {
            if (typeof proj4 !== 'function') {
              console.error("proj4 function is not available at transformation time.");
              throw new Error("proj4 is not available.");
            }

            console.log(`Transforming input: ${JSON.stringify(coord)}`);
            const result = proj4('EPSG:2056+LHN95', 'EPSG:4326', coord);
            console.log(`Transformation result: ${JSON.stringify(result)}`);

            if (coord.length >= 3 && result.length >= 3 && coord[2] === result[2]) {
                console.warn(`Height for coordinate ${JSON.stringify(coord)} did not change during transformation.`);
            }
            return result;

        } catch (transformError) {
            console.error(`Error transforming coordinate ${JSON.stringify(coord)}:`, transformError);
            if (transformError instanceof Error) { console.error(`Error Name: ${transformError.name}, Message: ${transformError.message}, Stack: ${transformError.stack}`); }
            return null;
        }
    }).filter(c => c !== null);

    // 5. Return result
    console.log("[REQUEST] Transformation successful. Returning 200 OK.");
    return new Response(
      JSON.stringify({ transformed: transformedCoordinates }),
      {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('[REQUEST] Unhandled error during request processing:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
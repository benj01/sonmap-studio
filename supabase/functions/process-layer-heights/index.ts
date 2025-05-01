// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
// @ts-ignore
import { corsHeaders } from '../_shared/cors.ts'

// Types for our data structures
interface LayerSettings {
  id: string
  default_base_elevation_source: 'terrain_surface' | 'geometry_z' | 'attribute'
  default_base_elevation_attribute: string | null
  default_height_top_source: 'fixed_value' | 'attribute' | 'none'
  default_height_top_value: string | null
  default_height_interpretation: 'absolute' | 'relative_to_ground'
}

interface GeoFeature {
  id: string
  geometry_original: any // GeoJSON geometry
  original_srid: number
  original_has_z: boolean
  original_vertical_datum_id: string | null
  attributes: Record<string, any>
}

interface VerticalDatum {
  id: string
  name: string
  epsg_code: number | null
  transformation_method: 'none' | 'reframe_api' | 'geoid_grid' | 'fixed_offset' | 'other'
}

interface ProcessResult {
  processed_count: number
  success_count: number
  failed_count: number
  errors: Array<{ feature_id: string; error: string }>
}

interface Coordinate {
  x: number
  y: number
  z: number
}

// Helper function to check if an object is a valid VerticalDatum
function isValidVerticalDatum(obj: any): obj is VerticalDatum {
  return (
    obj &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    (obj.epsg_code === null || typeof obj.epsg_code === 'number') &&
    (obj.transformation_method === 'none' ||
     obj.transformation_method === 'reframe_api' ||
     obj.transformation_method === 'geoid_grid' ||
     obj.transformation_method === 'fixed_offset' ||
     obj.transformation_method === 'other')
  )
}

// Helper function to extract coordinates from different geometry types
function extractCoordinates(geometry: any): Coordinate | null {
  if (!geometry || !geometry.type || !geometry.coordinates) {
    return null
  }

  switch (geometry.type) {
    case 'Point':
      const [x, y, z] = geometry.coordinates
      return { x, y, z: z || 0 }
    
    case 'LineString':
      // Use first vertex of the line
      const firstPoint = geometry.coordinates[0]
      if (firstPoint && firstPoint.length >= 2) {
        const [x, y, z] = firstPoint
        return { x, y, z: z || 0 }
      }
      return null
    
    case 'Polygon':
      // Use first vertex of the exterior ring
      const exteriorRing = geometry.coordinates[0]
      if (exteriorRing && exteriorRing.length > 0) {
        const firstPoint = exteriorRing[0]
        if (firstPoint && firstPoint.length >= 2) {
          const [x, y, z] = firstPoint
          return { x, y, z: z || 0 }
        }
      }
      return null
    
    case 'MultiPoint':
      // Use first point
      if (geometry.coordinates.length > 0) {
        const [x, y, z] = geometry.coordinates[0]
        return { x, y, z: z || 0 }
      }
      return null
    
    case 'MultiLineString':
      // Use first vertex of first line
      if (geometry.coordinates.length > 0 && geometry.coordinates[0].length > 0) {
        const [x, y, z] = geometry.coordinates[0][0]
        return { x, y, z: z || 0 }
      }
      return null
    
    case 'MultiPolygon':
      // Use first vertex of first polygon's exterior ring
      if (geometry.coordinates.length > 0 && 
          geometry.coordinates[0].length > 0 && 
          geometry.coordinates[0][0].length > 0) {
        const [x, y, z] = geometry.coordinates[0][0][0]
        return { x, y, z: z || 0 }
      }
      return null
    
    default:
      return null
  }
}

// Helper function to get height from feature based on source type
function getSourceHeight(
  feature: GeoFeature,
  sourceType: 'geometry_z' | 'attribute',
  attributeName?: string
): number | null {
  if (sourceType === 'geometry_z') {
    const coords = extractCoordinates(feature.geometry_original)
    return coords?.z ?? null
  } else if (sourceType === 'attribute' && attributeName) {
    const value = feature.attributes[attributeName]
    return typeof value === 'number' ? value : null
  }
  return null
}

// Helper function to transform coordinates using external API
async function transformCoordinates(
  x: number,
  y: number,
  h: number,
  sourceDatum: VerticalDatum
): Promise<{ ell_height: number } | null> {
  try {
    const supabaseUrl = Deno.env.get('EDGE_FUNCTION_SUPABASE_URL')
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL environment variable is not set')
    }

    const response = await fetch(`${supabaseUrl}/api/coordinates/transform`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        eastingLv95: x,
        northingLv95: y,
        lhn95Height: h,
        source_datum: sourceDatum.name,
      }),
    })

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Coordinate transformation failed:', error)
    return null
  }
}

// @ts-ignore
Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // Parse request body
    const { layer_id } = await req.json()
    if (!layer_id) {
      return new Response(
        JSON.stringify({ error: 'layer_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    // @ts-ignore
    const supabaseUrl = Deno.env.get('EDGE_FUNCTION_SUPABASE_URL')
    // @ts-ignore
    const supabaseServiceKey = Deno.env.get('EDGE_FUNCTION_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required environment variables')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch layer settings
    const { data: layer, error: layerError } = await supabase
      .from('layers')
      .select('*')
      .eq('id', layer_id)
      .single()

    if (layerError || !layer) {
      return new Response(
        JSON.stringify({ error: 'Layer not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const layerSettings = layer as LayerSettings

    // Fetch pending features
    const { data: features, error: featuresError } = await supabase
      .from('geo_features')
      .select(`
        id,
        ST_AsGeoJSON(geometry_original) as geometry_original,
        original_srid,
        original_has_z,
        original_vertical_datum_id,
        attributes
      `)
      .eq('layer_id', layer_id)
      .eq('height_transformation_status', 'pending')

    if (featuresError) {
      throw new Error(`Failed to fetch features: ${featuresError.message}`)
    }

    // Fetch vertical datums
    const datumIds = features
      .map((f: GeoFeature) => f.original_vertical_datum_id)
      .filter(Boolean) as string[]

    const { data: datums, error: datumsError } = await supabase
      .from('vertical_datums')
      .select('*')
      .in('id', datumIds)

    if (datumsError) {
      throw new Error(`Failed to fetch vertical datums: ${datumsError.message}`)
    }

    // Fetch WGS84 Ellipsoid datum
    const { data: wgs84Datum, error: wgs84Error } = await supabase
      .from('vertical_datums')
      .select('*')
      .eq('name', 'WGS84 Ellipsoid')
      .single()

    if (wgs84Error || !wgs84Datum) {
      throw new Error('Failed to fetch WGS84 Ellipsoid datum')
    }

    // Create datum lookup map with type validation
    const datumMap = new Map<string, VerticalDatum>()
    for (const datum of [...datums, wgs84Datum]) {
      if (isValidVerticalDatum(datum)) {
        datumMap.set(datum.id, datum)
      }
    }

    // Process features
    const result: ProcessResult = {
      processed_count: features.length,
      success_count: 0,
      failed_count: 0,
      errors: []
    }

    for (const feature of features) {
      try {
        let targetHeight: number | null = null
        let status = 'pending'
        let errorMsg: string | null = null
        let logEntry: Record<string, any> = {}

        // Handle terrain surface case
        if (layerSettings.default_base_elevation_source === 'terrain_surface') {
          status = 'complete'
          targetHeight = null
          logEntry = { method: 'clamp_to_ground' }
        } else {
          // Get source height
          const sourceHeight = getSourceHeight(
            feature,
            layerSettings.default_base_elevation_source,
            layerSettings.default_base_elevation_attribute ?? undefined
          )

          if (sourceHeight === null) {
            throw new Error('Could not determine source height')
          }

          const sourceDatum = feature.original_vertical_datum_id
            ? datumMap.get(feature.original_vertical_datum_id)
            : null

          if (!sourceDatum) {
            throw new Error('Source vertical datum not found')
          }

          // Check if transformation is needed
          if (sourceDatum.transformation_method === 'reframe_api') {
            const coords = extractCoordinates(feature.geometry_original)
            if (!coords) {
              throw new Error('Could not extract coordinates from geometry')
            }

            const transformResult = await transformCoordinates(
              coords.x,
              coords.y,
              sourceHeight,
              sourceDatum
            )

            if (transformResult) {
              targetHeight = transformResult.ell_height
              status = 'complete'
              logEntry = {
                method: 'reframe_api',
                source_h: sourceHeight,
                result_h: targetHeight
              }
            } else {
              throw new Error('API transformation failed')
            }
          } else {
            // No transformation needed
            targetHeight = sourceHeight
            status = 'complete'
            logEntry = {
              method: 'none',
              source_h: sourceHeight
            }
          }
        }

        // Calculate display parameters
        let displayObjectHeight: number | null = null
        if (layerSettings.default_height_top_source === 'fixed_value' && layerSettings.default_height_top_value !== null) {
          displayObjectHeight = parseFloat(layerSettings.default_height_top_value)
          if (isNaN(displayObjectHeight)) {
            displayObjectHeight = null
          }
        } else if (layerSettings.default_height_top_source === 'attribute' && layerSettings.default_height_top_value !== null) {
          const attrValue = feature.attributes[layerSettings.default_height_top_value]
          displayObjectHeight = typeof attrValue === 'number' ? attrValue : null
        }

        const displayHeightMode = layerSettings.default_base_elevation_source === 'terrain_surface'
          ? 'clamp_to_ground'
          : layerSettings.default_height_interpretation

        // Call database function to process geometry
        const { error: processError } = await supabase.rpc('process_feature_geometry', {
          p_feature_id: feature.id,
          p_target_ellipsoidal_height: targetHeight,
          p_display_object_height: displayObjectHeight,
          p_display_height_mode: displayHeightMode,
          p_calculation_log_entry: logEntry,
          p_status: status,
          p_error_message: errorMsg
        })

        if (processError) {
          throw new Error(`Database processing failed: ${processError.message}`)
        }

        result.success_count++
      } catch (error: unknown) {
        result.failed_count++
        result.errors.push({
          feature_id: feature.id,
          error: error instanceof Error ? error.message : 'Unknown error occurred'
        })
      }
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}) 
CREATE EXTENSION IF NOT EXISTS plv8;
-- Create the plv8 function for Swisstopo API integration
CREATE OR REPLACE FUNCTION transform_swiss_coords_swisstopo(
  easting_lv95 float,
  northing_lv95 float,
  lhn95_height float
) RETURNS jsonb
LANGUAGE plv8
AS $$
  // Swisstopo API endpoints
  const API_BASE = 'https://geodesy.geo.admin.ch/reframe';
  const TRANSFORM_ENDPOINT = `${API_BASE}/lv95towgs84`;
  const HEIGHT_ENDPOINT = `${API_BASE}/lhn95toellipsoid`;

  try {
    // First transform LV95 to WGS84
    const transformResponse = plv8.fetch(TRANSFORM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        easting: easting_lv95,
        northing: northing_lv95
      })
    });

    if (!transformResponse.ok) {
      throw new Error(`Transform API failed: ${transformResponse.status} ${transformResponse.statusText}`);
    }

    const transformResult = JSON.parse(transformResponse.body);
    const { lon, lat } = transformResult;

    // Then transform LHN95 height to ellipsoidal height
    const heightResponse = plv8.fetch(HEIGHT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        easting: easting_lv95,
        northing: northing_lv95,
        height: lhn95_height
      })
    });

    if (!heightResponse.ok) {
      throw new Error(`Height API failed: ${heightResponse.status} ${heightResponse.statusText}`);
    }

    const heightResult = JSON.parse(heightResponse.body);
    const { ell_height } = heightResult;

    // Return combined result
    return {
      lon,
      lat,
      ell_height
    };
  } catch (error) {
    // Log error and return null
    plv8.elog(WARNING, `Swisstopo API error: ${error.message}`);
    return null;
  }
$$; 
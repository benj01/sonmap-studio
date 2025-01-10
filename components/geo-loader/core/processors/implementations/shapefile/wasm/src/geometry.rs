use geo_types::{Coord, LineString, MultiLineString, MultiPoint, MultiPolygon, Point, Polygon};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Serialize, Deserialize)]
pub struct Bounds {
    min_x: f64,
    min_y: f64,
    max_x: f64,
    max_y: f64,
}

impl Default for Bounds {
    fn default() -> Self {
        Bounds {
            min_x: f64::INFINITY,
            min_y: f64::INFINITY,
            max_x: f64::NEG_INFINITY,
            max_y: f64::NEG_INFINITY,
        }
    }
}

// Calculate bounds for an array of coordinates
pub fn calculate_bounds(coordinates: &[f64]) -> Result<Vec<f64>, JsError> {
    if coordinates.len() % 2 != 0 {
        return Err(JsError::new("Coordinates array must have even length"));
    }

    let mut bounds = Bounds::default();

    for chunk in coordinates.chunks(2) {
        let x = chunk[0];
        let y = chunk[1];
        bounds.min_x = bounds.min_x.min(x);
        bounds.min_y = bounds.min_y.min(y);
        bounds.max_x = bounds.max_x.max(x);
        bounds.max_y = bounds.max_y.max(y);
    }

    if !bounds.min_x.is_finite() {
        Ok(vec![0.0, 0.0, 0.0, 0.0])
    } else {
        Ok(vec![bounds.min_x, bounds.min_y, bounds.max_x, bounds.max_y])
    }
}

// Check if a ring is clockwise
#[wasm_bindgen]
pub fn is_clockwise(coordinates: &[f64]) -> Result<bool, JsError> {
    if coordinates.len() < 6 {
        // Need at least 3 points for a ring
        return Err(JsError::new("Ring must have at least 3 points"));
    }

    let mut sum = 0.0;
    let points: Vec<(f64, f64)> = coordinates
        .chunks(2)
        .map(|chunk| (chunk[0], chunk[1]))
        .collect();

    for i in 0..points.len() - 1 {
        let (x1, y1) = points[i];
        let (x2, y2) = points[i + 1];
        sum += (x2 - x1) * (y2 + y1);
    }

    Ok(sum > 0.0)
}

// Convert point coordinates to GeoJSON format
#[wasm_bindgen]
pub fn convert_point(x: f64, y: f64) -> Result<JsValue, JsError> {
    let point = Point::new(x, y);
    serde_wasm_bindgen::to_value(&point).map_err(|e| JsError::new(&e.to_string()))
}

// Convert array of points to MultiPoint
#[wasm_bindgen]
pub fn convert_multi_point(coordinates: &[f64]) -> Result<JsValue, JsError> {
    if coordinates.len() % 2 != 0 {
        return Err(JsError::new("Coordinates array must have even length"));
    }

    let points: Vec<Point<f64>> = coordinates
        .chunks(2)
        .map(|chunk| Point::new(chunk[0], chunk[1]))
        .collect();

    let multi_point = MultiPoint(points);
    serde_wasm_bindgen::to_value(&multi_point).map_err(|e| JsError::new(&e.to_string()))
}

// Convert array of line coordinates to LineString or MultiLineString
#[wasm_bindgen]
pub fn convert_polyline(coordinates: &[f64]) -> Result<JsValue, JsError> {
    if coordinates.len() % 2 != 0 {
        return Err(JsError::new("Coordinates array must have even length"));
    }

    let points: Vec<Coord<f64>> = coordinates
        .chunks(2)
        .map(|chunk| Coord {
            x: chunk[0],
            y: chunk[1],
        })
        .collect();

    let line_string = LineString(points);
    serde_wasm_bindgen::to_value(&line_string).map_err(|e| JsError::new(&e.to_string()))
}

// Convert array of polygon rings to Polygon or MultiPolygon
#[wasm_bindgen]
pub fn convert_polygon(coordinates: &[f64], ring_sizes: &[usize]) -> Result<JsValue, JsError> {
    if coordinates.len() % 2 != 0 {
        return Err(JsError::new("Coordinates array must have even length"));
    }

    let mut rings: Vec<LineString<f64>> = Vec::new();
    let mut offset = 0;

    for &size in ring_sizes {
        let ring_coords = &coordinates[offset..offset + size * 2];
        let points: Vec<Coord<f64>> = ring_coords
            .chunks(2)
            .map(|chunk| Coord {
                x: chunk[0],
                y: chunk[1],
            })
            .collect();
        rings.push(LineString(points));
        offset += size * 2;
    }

    let mut polygons: Vec<Polygon<f64>> = Vec::new();
    let mut current_polygon = Vec::new();

    for ring in rings {
        if is_clockwise(&ring.0.iter().flat_map(|c| vec![c.x, c.y]).collect::<Vec<f64>>())? {
            if !current_polygon.is_empty() {
                polygons.push(Polygon::new(
                    current_polygon[0].clone(),
                    current_polygon[1..].to_vec(),
                ));
            }
            current_polygon = vec![ring];
        } else {
            current_polygon.push(ring);
        }
    }

    if !current_polygon.is_empty() {
        polygons.push(Polygon::new(
            current_polygon[0].clone(),
            current_polygon[1..].to_vec(),
        ));
    }

    if polygons.len() == 1 {
        serde_wasm_bindgen::to_value(&polygons[0]).map_err(|e| JsError::new(&e.to_string()))
    } else {
        let multi_polygon = MultiPolygon(polygons);
        serde_wasm_bindgen::to_value(&multi_polygon).map_err(|e| JsError::new(&e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wasm_bindgen_test::*;

    #[wasm_bindgen_test]
    fn test_calculate_bounds() {
        let coords = vec![0.0, 0.0, 1.0, 1.0, 2.0, 2.0];
        let bounds = calculate_bounds(&coords).unwrap();
        assert_eq!(bounds, vec![0.0, 0.0, 2.0, 2.0]);
    }

    #[wasm_bindgen_test]
    fn test_is_clockwise() {
        // Clockwise triangle
        let clockwise = vec![0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0];
        assert!(is_clockwise(&clockwise).unwrap());

        // Counter-clockwise triangle
        let counter_clockwise = vec![0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0];
        assert!(!is_clockwise(&counter_clockwise).unwrap());
    }
}

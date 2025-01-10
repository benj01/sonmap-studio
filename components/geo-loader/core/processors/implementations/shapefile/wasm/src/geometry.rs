use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::geojson::{LineString, MultiPoint, MultiPolygon, Point, Polygon};

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

    let points: Vec<Vec<f64>> = coordinates
        .chunks(2)
        .map(|chunk| vec![chunk[0], chunk[1]])
        .collect();

    let multi_point = MultiPoint::new(points);
    serde_wasm_bindgen::to_value(&multi_point).map_err(|e| JsError::new(&e.to_string()))
}

// Convert array of line coordinates to LineString
#[wasm_bindgen]
pub fn convert_polyline(coordinates: &[f64]) -> Result<JsValue, JsError> {
    if coordinates.len() % 2 != 0 {
        return Err(JsError::new("Coordinates array must have even length"));
    }

    let points: Vec<Vec<f64>> = coordinates
        .chunks(2)
        .map(|chunk| vec![chunk[0], chunk[1]])
        .collect();

    let line_string = LineString::new(points);
    serde_wasm_bindgen::to_value(&line_string).map_err(|e| JsError::new(&e.to_string()))
}

// Convert array of polygon rings to Polygon or MultiPolygon
#[wasm_bindgen]
pub fn convert_polygon(coordinates: &[f64], ring_sizes: &[usize]) -> Result<JsValue, JsError> {
    if coordinates.len() % 2 != 0 {
        return Err(JsError::new("Coordinates array must have even length"));
    }

    let mut rings: Vec<Vec<Vec<f64>>> = Vec::new();
    let mut offset = 0;

    for &size in ring_sizes {
        let ring_coords = &coordinates[offset..offset + size * 2];
        let points: Vec<Vec<f64>> = ring_coords
            .chunks(2)
            .map(|chunk| vec![chunk[0], chunk[1]])
            .collect();
        rings.push(points);
        offset += size * 2;
    }

    let mut polygons: Vec<Vec<Vec<Vec<f64>>>> = Vec::new();
    let mut current_polygon: Vec<Vec<Vec<f64>>> = Vec::new();

    for ring in rings {
        let ring_coords: Vec<f64> = ring.iter().flat_map(|p| p.iter().copied()).collect();
        if is_clockwise(&ring_coords)? {
            if !current_polygon.is_empty() {
                polygons.push(current_polygon);
                current_polygon = Vec::new();
            }
            current_polygon.push(ring);
        } else {
            current_polygon.push(ring);
        }
    }

    if !current_polygon.is_empty() {
        polygons.push(current_polygon);
    }

    if polygons.len() == 1 {
        let polygon = Polygon::new(polygons[0].clone());
        serde_wasm_bindgen::to_value(&polygon).map_err(|e| JsError::new(&e.to_string()))
    } else {
        let multi_polygon = MultiPolygon::new(polygons);
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

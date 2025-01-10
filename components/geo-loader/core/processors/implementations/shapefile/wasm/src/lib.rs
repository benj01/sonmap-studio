use wasm_bindgen::prelude::*;

mod geometry;
mod validation;
mod geojson;

// Initialize better error handling for Wasm
#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

// Re-export geometry functions
pub use geometry::{
    calculate_bounds,
    convert_point,
    convert_multi_point,
    convert_polyline,
    convert_polygon,
    is_clockwise,
};

// Re-export validation functions
pub use validation::{
    validate_header_buffer,
    validate_file_code,
    validate_file_length,
    validate_version,
    validate_bounding_box,
    validate_record_content_length,
    validate_record_buffer_space,
    validate_point_coordinates,
    validate_parts_and_points,
    validate_part_index,
    validate_part_range,
    validate_shape_type,
};

// Main WebAssembly interface
#[wasm_bindgen]
pub struct ShapefileProcessor {
    // Will hold internal state if needed
}

#[wasm_bindgen]
impl ShapefileProcessor {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        ShapefileProcessor {}
    }

    #[wasm_bindgen]
    pub fn process_geometry(&self, shape_type: u32, coordinates: &[f64]) -> Result<JsValue, JsError> {
        // Validate shape type first
        if !validation::validate_shape_type(shape_type)? {
            return Err(JsError::new("Invalid or null shape type"));
        }

        // Process based on shape type
        match shape_type {
            1 => { // Point
                if coordinates.len() != 2 {
                    return Err(JsError::new("Point must have exactly 2 coordinates"));
                }
                geometry::convert_point(coordinates[0], coordinates[1])
            },
            3 => { // PolyLine
                geometry::convert_polyline(coordinates)
            },
            5 => { // Polygon
                // For polygons, we need ring sizes. For now, treat as one ring
                let ring_sizes = vec![coordinates.len() / 2];
                geometry::convert_polygon(coordinates, &ring_sizes)
            },
            8 => { // MultiPoint
                geometry::convert_multi_point(coordinates)
            },
            _ => Err(JsError::new("Unsupported shape type")),
        }
    }
}

// Tests module
#[cfg(test)]
mod tests {
    use super::*;
    use wasm_bindgen_test::*;

    #[wasm_bindgen_test]
    fn test_processor_creation() {
        let processor = ShapefileProcessor::new();
        assert!(validate_shape_type(1).unwrap());
    }

    #[wasm_bindgen_test]
    fn test_process_point() {
        let processor = ShapefileProcessor::new();
        let coords = vec![1.0, 2.0];
        let result = processor.process_geometry(1, &coords);
        assert!(result.is_ok());
    }
}

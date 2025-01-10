use wasm_bindgen::prelude::*;
use console_error_panic_hook;

// Initialize better error handling for Wasm
#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

// Re-export modules
pub mod geometry;
pub mod validation;

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

    // Geometry calculation methods will be added here
    #[wasm_bindgen]
    pub fn calculate_bounds(&self, coordinates: &[f64]) -> Result<Vec<f64>, JsError> {
        // This will be implemented in geometry.rs
        geometry::calculate_bounds(coordinates)
    }

    // Validation methods will be added here
    #[wasm_bindgen]
    pub fn validate_shape_type(&self, shape_type: u32) -> Result<bool, JsError> {
        // This will be implemented in validation.rs
        validation::validate_shape_type(shape_type)
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
        assert!(processor.validate_shape_type(1).unwrap());
    }
}

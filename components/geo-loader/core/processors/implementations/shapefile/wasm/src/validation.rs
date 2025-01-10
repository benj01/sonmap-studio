use serde::Serialize;
use wasm_bindgen::prelude::*;

// Constants matching TypeScript implementation
const HEADER_LENGTH: usize = 100;
const FILE_CODE: i32 = 9994;
const VERSION: i32 = 1000;

#[derive(Serialize)]
pub struct ValidationDetails {
    code: String,
    info: String,
}

#[derive(Serialize)]
pub struct ValidationIssue {
    issue_type: String,
    message: String,
    details: Option<ValidationDetails>,
}

impl ValidationIssue {
    pub fn new(issue_type: &str, message: &str, code: Option<&str>, info: Option<&str>) -> Self {
        ValidationIssue {
            issue_type: issue_type.to_string(),
            message: message.to_string(),
            details: match (code, info) {
                (Some(c), Some(i)) => Some(ValidationDetails {
                    code: c.to_string(),
                    info: i.to_string(),
                }),
                _ => None,
            },
        }
    }
}

// Validate shapefile header buffer length
#[wasm_bindgen]
pub fn validate_header_buffer(buffer_length: usize) -> Result<(), JsError> {
    if buffer_length < HEADER_LENGTH {
        return Err(JsError::new(&format!(
            "Invalid shapefile: buffer too small for header (got {}, need {})",
            buffer_length, HEADER_LENGTH
        )));
    }
    Ok(())
}

// Validate file code
#[wasm_bindgen]
pub fn validate_file_code(file_code: i32) -> Result<(), JsError> {
    if file_code != FILE_CODE {
        return Err(JsError::new(&format!(
            "Invalid shapefile: incorrect file code (got {}, expected {})",
            file_code, FILE_CODE
        )));
    }
    Ok(())
}

// Validate file length
#[wasm_bindgen]
pub fn validate_file_length(file_length: usize, buffer_length: usize) -> Result<(), JsError> {
    if file_length < HEADER_LENGTH || file_length > buffer_length {
        return Err(JsError::new(&format!(
            "Invalid shapefile: incorrect file length (got {}, buffer size {})",
            file_length, buffer_length
        )));
    }
    Ok(())
}

// Validate shapefile version
#[wasm_bindgen]
pub fn validate_version(version: i32) -> Result<(), JsError> {
    if version != VERSION {
        return Err(JsError::new(&format!(
            "Invalid shapefile: unsupported version (got {}, expected {})",
            version, VERSION
        )));
    }
    Ok(())
}

// Validate bounding box coordinates
#[wasm_bindgen]
pub fn validate_bounding_box(x_min: f64, y_min: f64, x_max: f64, y_max: f64) -> Result<(), JsError> {
    if !x_min.is_finite() || !y_min.is_finite() || !x_max.is_finite() || !y_max.is_finite() {
        return Err(JsError::new(&format!(
            "Invalid shapefile: invalid bounding box coordinates ({}, {}, {}, {})",
            x_min, y_min, x_max, y_max
        )));
    }
    Ok(())
}

// Validate record content length
#[wasm_bindgen]
pub fn validate_record_content_length(content_length: i32, record_number: i32) -> Result<(), JsError> {
    if content_length < 0 || content_length > 1_000_000 {
        return Err(JsError::new(&format!(
            "Invalid shapefile: unreasonable record content length {} for record {}",
            content_length, record_number
        )));
    }
    Ok(())
}

// Validate record buffer space
#[wasm_bindgen]
pub fn validate_record_buffer_space(
    offset: usize,
    record_size: usize,
    buffer_length: usize,
    record_number: i32,
) -> Result<(), JsError> {
    if offset + record_size > buffer_length {
        return Err(JsError::new(&format!(
            "Invalid shapefile: truncated record content for record {} (need {} bytes, have {})",
            record_number,
            record_size,
            buffer_length - offset
        )));
    }
    Ok(())
}

// Validate point coordinates
#[wasm_bindgen]
pub fn validate_point_coordinates(
    x: f64,
    y: f64,
    part_index: i32,
    point_index: i32,
) -> Result<(), JsError> {
    if !x.is_finite() || !y.is_finite() {
        return Err(JsError::new(&format!(
            "Invalid shapefile: non-finite coordinates ({}, {}) at part {}, point {}",
            x, y, part_index, point_index
        )));
    }
    Ok(())
}

// Validate number of parts and points for complex shapes
#[wasm_bindgen]
pub fn validate_parts_and_points(
    num_parts: i32,
    num_points: i32,
    shape_type: &str,
) -> Result<(), JsError> {
    if num_parts <= 0
        || num_parts > 1_000_000
        || num_points <= 0
        || num_points > 1_000_000
    {
        return Err(JsError::new(&format!(
            "Invalid {}: unreasonable number of parts ({}) or points ({})",
            shape_type, num_parts, num_points
        )));
    }
    Ok(())
}

// Validate part index
#[wasm_bindgen]
pub fn validate_part_index(part_index: i32, num_points: i32) -> Result<(), JsError> {
    if part_index < 0 || part_index >= num_points {
        return Err(JsError::new(&format!(
            "Invalid shapefile: part index {} out of bounds (num points: {})",
            part_index, num_points
        )));
    }
    Ok(())
}

// Validate part range
#[wasm_bindgen]
pub fn validate_part_range(start: i32, end: i32, part_index: i32) -> Result<(), JsError> {
    if start >= end {
        return Err(JsError::new(&format!(
            "Invalid shapefile: part {} has invalid range ({} >= {})",
            part_index, start, end
        )));
    }
    Ok(())
}

// Validate shape type
#[wasm_bindgen]
pub fn validate_shape_type(shape_type: u32) -> Result<bool, JsError> {
    // Shape types from the Shapefile specification
    match shape_type {
        0 => Ok(false), // Null shape
        1 => Ok(true),  // Point
        3 => Ok(true),  // PolyLine
        5 => Ok(true),  // Polygon
        8 => Ok(true),  // MultiPoint
        11 => Ok(true), // PointZ
        13 => Ok(true), // PolyLineZ
        15 => Ok(true), // PolygonZ
        18 => Ok(true), // MultiPointZ
        21 => Ok(true), // PointM
        23 => Ok(true), // PolyLineM
        25 => Ok(true), // PolygonM
        28 => Ok(true), // MultiPointM
        31 => Ok(true), // MultiPatch
        _ => Err(JsError::new(&format!("Invalid shape type: {}", shape_type))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wasm_bindgen_test::*;

    #[wasm_bindgen_test]
    fn test_validate_file_code() {
        assert!(validate_file_code(FILE_CODE).is_ok());
        assert!(validate_file_code(0).is_err());
    }

    #[wasm_bindgen_test]
    fn test_validate_bounding_box() {
        assert!(validate_bounding_box(0.0, 0.0, 1.0, 1.0).is_ok());
        assert!(validate_bounding_box(f64::INFINITY, 0.0, 1.0, 1.0).is_err());
    }

    #[wasm_bindgen_test]
    fn test_validate_shape_type() {
        assert!(validate_shape_type(1).unwrap()); // Point
        assert!(!validate_shape_type(0).unwrap()); // Null shape
        assert!(validate_shape_type(999).is_err()); // Invalid
    }
}

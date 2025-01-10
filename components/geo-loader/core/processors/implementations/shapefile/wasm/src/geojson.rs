use serde::Serialize;

#[derive(Serialize)]
pub struct Point {
    #[serde(rename = "type")]
    type_name: String,
    coordinates: Vec<f64>,
}

#[derive(Serialize)]
pub struct MultiPoint {
    #[serde(rename = "type")]
    type_name: String,
    coordinates: Vec<Vec<f64>>,
}

#[derive(Serialize)]
pub struct LineString {
    #[serde(rename = "type")]
    type_name: String,
    coordinates: Vec<Vec<f64>>,
}

#[derive(Serialize)]
pub struct MultiLineString {
    #[serde(rename = "type")]
    type_name: String,
    coordinates: Vec<Vec<Vec<f64>>>,
}

#[derive(Serialize)]
pub struct Polygon {
    #[serde(rename = "type")]
    type_name: String,
    coordinates: Vec<Vec<Vec<f64>>>,
}

#[derive(Serialize)]
pub struct MultiPolygon {
    #[serde(rename = "type")]
    type_name: String,
    coordinates: Vec<Vec<Vec<Vec<f64>>>>,
}

impl Point {
    pub fn new(x: f64, y: f64) -> Self {
        Point {
            type_name: "Point".to_string(),
            coordinates: vec![x, y],
        }
    }
}

impl MultiPoint {
    pub fn new(points: Vec<Vec<f64>>) -> Self {
        MultiPoint {
            type_name: "MultiPoint".to_string(),
            coordinates: points,
        }
    }
}

impl LineString {
    pub fn new(points: Vec<Vec<f64>>) -> Self {
        LineString {
            type_name: "LineString".to_string(),
            coordinates: points,
        }
    }
}

impl MultiLineString {
    pub fn new(lines: Vec<Vec<Vec<f64>>>) -> Self {
        MultiLineString {
            type_name: "MultiLineString".to_string(),
            coordinates: lines,
        }
    }
}

impl Polygon {
    pub fn new(rings: Vec<Vec<Vec<f64>>>) -> Self {
        Polygon {
            type_name: "Polygon".to_string(),
            coordinates: rings,
        }
    }
}

impl MultiPolygon {
    pub fn new(polygons: Vec<Vec<Vec<Vec<f64>>>>) -> Self {
        MultiPolygon {
            type_name: "MultiPolygon".to_string(),
            coordinates: polygons,
        }
    }
}

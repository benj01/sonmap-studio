# DXF Parser Regex Issue

## Issue Status: ACTIVE
**Issue Identifier:** dxf-parser-regex
**Component:** DXF Parser
**Impact Level:** High
**Tags:** #parser #regex #dxf

### Problem Statement
The DXF parser's entity regex pattern is too strict with whitespace handling, causing no entities to be found in valid DXF files. This leads to empty preview maps and no feature generation.

### Error Indicators
- No preview map displayed
- "No valid coordinates found for bounds calculation" in logs
- Entity array shows length: 0
- LWPOLYLINE entities are found in initial scan but not parsed

### Key Discoveries
- Discovery #1: Entity regex pattern is too strict
  - Current pattern: `/0[\s\n]+(\w+)([\s\S]*?)(?=0[\s\n]+(?:\w+|ENDSEC)|\Z)/gm`
  - Only matches single whitespace or newline after group code
  - DXF files can have varying amounts of whitespace and carriage returns
  - Pattern needs to be more flexible with whitespace handling

### Current Understanding
- DXF file format allows flexible whitespace between group codes and values
- Current regex pattern is too restrictive in whitespace matching
- Need to handle various line ending styles (CR, LF, CRLF)
- Pattern should match any amount of whitespace between elements

## Solution Attempts Log

### Attempt #1 - Centralize and Update Regex Patterns (Failed)
**Hypothesis:** Moving regex patterns to a dedicated file and making them more flexible will improve parsing reliability
**Result:** Initial attempt failed - patterns were not handling DXF group codes correctly

### Attempt #2 - Fix Group Code Handling (Failed)
**Hypothesis:** Initial attempt at handling group codes was still too permissive
**Result:** Pattern was capturing too much content, leading to parsing failures

### Attempt #3 - Strict Section Pattern (Partial Success)
**Hypothesis:** Making the section pattern more precise about DXF structure will fix parsing
**Result:** Improved section detection but entity parsing still failing

### Attempt #4 - Improved Entity Pattern (Partial Success)
**Hypothesis:** Entity pattern needs better boundary detection for group codes
**Result:** Better entity detection but coordinate parsing still unreliable

### Attempt #5 - Line-Based Group Code Parsing
**Hypothesis:** Regex-based group code parsing is too error-prone for DXF's line-based format
**Tags:** #parsing #dxf-format #coordinates
**Approach:** Switch to line-based parsing for group codes

**Changes Overview:**
1. Replaced regex-based group code parsing with line-based approach:
   ```typescript
   // Old approach used regex pattern
   const GROUP_CODE_PATTERN = /(\d+)[\s\r\n]+([^\r\n]+)/gm;
   const matches = content.matchAll(GROUP_CODE_PATTERN);

   // New approach uses line-based parsing
   const lines = content.split(/\r\n|\r|\n/);
   for (let i = 0; i < lines.length - 1; i += 2) {
     const code = parseInt(lines[i].trim());
     const value = lines[i + 1].trim();
     if (!isNaN(code)) {
       groupCodes.push([code, value]);
     }
   }
   ```

**Changes Explained:**
1. Line-Based Processing:
   - Split content into lines first
   - Process lines in pairs (code + value)
   - Ensures proper line-based structure
   - Handles all line ending types

2. Strict Parsing:
   - Each group code must be on its own line
   - Each value must be on the following line
   - No mixing of codes and values
   - Better error detection

3. Key Improvements:
   - More reliable coordinate parsing
   - Better handling of line endings
   - Clearer error cases
   - Follows DXF format exactly

**Results:**
1. More reliable group code parsing
2. Better coordinate extraction
3. Cleaner data structure
4. Follows DXF specification

**Next Steps:**
1. Test with testlinie.dxf
2. Monitor coordinate parsing
3. Verify feature generation
4. Check preview map display

**Next Steps:**
1. Test with testlinie.dxf
2. Monitor entity detection and parsing
3. Verify feature generation
4. Check preview map display

## Key Discoveries
- Discovery #2: DXF format uses group codes extensively
  - Each value is preceded by a group code
  - Group codes determine value meaning
  - Must handle group codes properly for reliable parsing

## Current Understanding
- DXF files use group codes to identify data types
- Each value must be read with its group code
- Section names come after group code 2
- Entity types come after group code 0
- Need to handle variable content between codes

## Diagnosis Tools Setup
- Debug logging throughout parser chain
- Entity type validation checks
- Coordinate validation
- Feature conversion logging

## Next Session Focus
1. Implement regex pattern update
2. Test with sample DXF files
3. Verify preview map generation
4. Update documentation if successful

---

# Log Maintenance Notes
- Keep latest attempts in detail
- Update understanding after each attempt
- Document all significant realizations
- Track any side effects or new issues

# Debug Tracking Protocol - Instructions

## File Organization

### Folder Structure
```
project-root/
└── bug_track/
    ├── active/
    │   ├── auth-token-validation.md
    │   └── payment-processing-timeout.md
    └── resolved/
        ├── user-signup-flow.md
        └── api-rate-limiting.md
```

### Naming Conventions
- Format: `[system]-[specific-issue].md`
- Examples:
  - `auth-token-validation.md`
  - `payment-processing-timeout.md`
  - `user-profile-loading.md`
- Use kebab-case (lowercase with hyphens)
- Focus on the specific issue rather than general area
- Bad: `auth-bug.md`, `payment-issue.md`
- Good: `auth-token-validation.md`, `payment-timeout-stripe.md`

### File Location Rules
- Active issues: `bug_track/active/`
- Resolved issues: `bug_track/resolved/`
- Template file for tracker: `bug_track\debug-tracker.md`
- Keep same filename when moving to resolved
- Never delete resolved trackers

## Knowledge Preservation Guidelines

### Key Insights Tracking
When you discover important system behavior or relationships:
```markdown
## Key Discoveries
- Discovery #1: [Date initially assumed X was causing Y, but found that Z is the actual trigger because...]
- Discovery #2: [Authentication flow actually works like... instead of... which means...]
- Discovery #3: [Component A and B interact through... rather than... as originally thought]

Each discovery should include:
- What was originally assumed/understood
- What was discovered
- Why this is significant
- How it affects the solution approach
```

### Correction Tracking
When previous understanding or changes need to be corrected:
```markdown
## Understanding Corrections
- Correction #1: [Previous understanding about X was wrong because...]
  - What we thought: [original understanding]
  - Why it was wrong: [explanation]
  - Corrected understanding: [new understanding]
  - Changes needed: [what needs to be modified]

- Correction #2: [Changes in attempt #X need to be reverted because...]
  - What was changed: [summary of changes]
  - Why it needs reverting: [explanation]
  - Impact on other changes: [what else is affected]
  - Correct approach: [what should be done instead]
```

## Instructions for AI Assistant

### Initial Contact Protocol

When user provides an issue report:

1. First Response Actions:
   ```markdown
   I'll help with the [specific feature] issue. Let me check the existing tracking information:
   
   1. Checking bug_track/active/ for any related issues...
   2. Analyzing provided screenshot/error details...
   3. [If found] Continuing with existing tracker: [filename]
      [If not found] Creating new tracker: [proposed-filename]
   ```

2. Directory Scan:
   - Look for related files in bug_track/active/
   - Use component/feature name in filenames
   - Check for similar issues in bug_track/resolved/

3. If Screenshot/Error Provided:
   - Acknowledge receipt of visual information
   - Connect visual elements to related components
   - Include relevant UI/error details in Problem Statement

4. Tracker Creation/Selection:
   - If similar issue exists, use that tracker
   - If new issue, create filename based on component
   - Example: `import-dialog-validation.md` for import dialog issues

### When Starting a Conversation

1. Check for existing tracker:
   - Look in `bug_track/active/`
   - If unsure, ask user for correct tracker

2. If no tracker exists:
   - Create new file in `bug_track/active/`
   - Use descriptive naming convention
   - Begin with Problem Statement and Attempt #1

3. If tracker exists:
   - Review all previous content carefully
   - Pay special attention to Key Discoveries and Corrections
   - Continue with next attempt number

### When You Realize Something Important
1. Update Key Discoveries immediately:
   ```markdown
   New Discovery: [Clear explanation of realization]
   - Previous understanding: [What we thought]
   - Actual behavior: [What we now know]
   - Implications: [How this affects our approach]
   - Next steps: [What needs to change]
   ```

2. If this invalidates previous changes:
   ```markdown
   New Correction Needed:
   - Affected attempts: [List attempt numbers]
   - What needs reversal: [Specific changes]
   - Why: [Clear explanation]
   - New direction: [What to do instead]
   ```

### During Debug Sessions
[Previous content about suggesting changes remains the same]

### When Issue is Resolved (ask user if that's the case!)
1. Ensure all discoveries and corrections are clearly documented
2. Add final summary of actual root cause and solution
3. Document any remaining uncertainties or potential future issues
4. Move file to `bug_track/resolved/`

## Example Documentation

### Key Discoveries Example
```markdown
## Key Discoveries

Discovery #1: Authentication Token Flow
- Previous understanding: Tokens were validated on each API call
- Actual behavior: Tokens are pre-validated at route change
- Implication: This explains the delayed logout behavior
- Impact: Need to refactor route guards rather than API layer

Discovery #2: Cache Interaction
- Found that Redis cache isn't being cleared on token refresh
- This causes stale tokens to appear valid
- Affects all authentication attempts after token expiry
- Requires cache invalidation implementation
```

### Understanding Corrections Example
```markdown
## Understanding Corrections

Correction #1: WebSocket Connection
- What we thought: WebSocket disconnects were causing auth failures
- Why it was wrong: Log analysis shows WebSocket remains connected
- Actual issue: Auth token not included in WebSocket handshake
- Required changes: Add token to WebSocket connection setup

Correction #2: Database Deadlock
- Changes in attempt #8 caused deadlock potential
- Affected files: user-service.ts, auth-middleware.ts
- Must revert transaction isolation level changes
- Replace with optimistic locking strategy
```

## What Not To Do
- Don't delete or override previous discoveries/corrections
- Don't leave realizations undocumented
- Don't wait to document important insights
- Don't use vague descriptions
- Don't include time-based references
- Don't use general file names
- Don't mix multiple root causes in one tracker

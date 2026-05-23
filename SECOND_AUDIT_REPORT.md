# SECOND AUDIT: EDGE CASES & ROBUSTNESS

## Issues Found

### 1. EXCEPTION HANDLING (High Priority)

**Issue 1.1:** email_check.py 401 retry logic
- Only retries once if token expires
- What if retry also fails? Exception propagates
- Routine crashes on any Graph API errors

**Issue 1.2:** email_send.py attachment size
- No size validation before sending
- Large Excel files (>4MB) may silently fail
- User won't know email wasn't sent

**Issue 1.3:** run_state.write() error handling  
- If file write fails (disk full), exception raised
- Caller must handle it
- Routine could crash with partial commits

### 2. DATA ATOMICITY (Medium Priority)

**Issue 2.1:** File save + state update not atomic
- Route D: attachment saved to disk, then state updated
- If state update fails, file orphaned on disk
- If state update succeeds but email send fails, duplicate processing risk

**Issue 2.2:** Non-idempotent operations
- If send_email() fails after building Excel, state says "sent"
- Next tick won't rebuild Excel
- User gets no notification but run marked as WAITING_FEEDBACK

### 3. RATE LIMITING (Medium Priority)

**Issue 3.1:** Pipedrive lookups unbatched
- Spec says "max 5 simultaneous" but not enforced
- 100 companies = 100 simultaneous API calls possible
- Could trigger 429 rate limit errors

**Issue 3.2:** No timeout on git operations
- `git pull` has no timeout
- Could hang forever on network issues
- Routine would miss hour's polling

### 4. FILE HANDLING (Medium Priority)

**Issue 4.1:** Excel files not validated
- Corrupted .xlsx causes openpyxl to crash
- No integrity check before using

**Issue 4.2:** Attachment size not checked
- Pipedrive API rejects files > 10MB
- No pre-validation, silent failure

### 5. STATE MANAGEMENT (Low Priority)

**Issue 5.1:** Status values not normalized
- Typo in status (e.g., "WATING_START") creates orphaned run
- list_active() treats any non-COMPLETED as active
- Orphaned runs accumulate

**Issue 5.2:** Missing required fields silent
- If "author" field missing from state, read() returns None
- Caller must check every field

### 6. SECURITY (Low Priority)

**Issue 6.1:** Credential exposure in bash history
- GRAPH_CLIENT_SECRET visible in routine_prompt
- Visible in logs, bash history

**Issue 6.2:** Email content not sanitized
- User email body treated as trusted input
- Malicious prompts could be injected into state

### 7. OPERATIONAL (Low Priority)

**Issue 7.1:** No disk cleanup
- `runs/` directory accumulates indefinitely
- No archival or cleanup strategy

**Issue 7.2:** No health monitoring
- Failing routine has no alerts
- No metrics or health checks

## Severity Summary

| Level | Count | Examples |
|-------|-------|----------|
| Critical | 0 | None |
| High | 3 | Exception handling, attachment size, file write errors |
| Medium | 4 | Data atomicity, rate limiting, file handling, state management |
| Low | 3 | Credentials, email content, disk cleanup |

## Recommendations

### MUST FIX (before 24/7 production)
1. Wrap all API calls in try/except blocks
2. Add file size validation before Graph/Pipedrive operations
3. Implement batch rate limiting for Pipedrive (max 5 concurrent)
4. Add transaction-like safety for file + state updates

### SHOULD FIX (before full deployment)
5. Normalize status values in run_state
6. Add required field validation in all modules
7. Implement git operation timeouts
8. Add Excel file integrity checks

### NICE TO HAVE (future improvements)
9. Mask credentials in logs
10. Add disk usage monitoring
11. Implement run archival/cleanup
12. Add health check endpoint

## Current Status

**Production Readiness:** ⚠️ **LIMITED TESTING ONLY**

The system is functionally complete for basic workflows but has edge cases that could cause crashes in production:
- Unhandled exceptions
- Non-atomic operations
- Missing rate limiting
- No operational monitoring

**Recommendation:** 
- Ready for controlled testing with real emails
- Not ready for 24/7 unattended operation
- Needs error handling improvements before full deployment


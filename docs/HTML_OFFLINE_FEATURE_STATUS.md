# HTML Offline Viewing Feature - Implementation Status

> **STATUS: NEEDS VERIFICATION** - Implementation complete but not fully tested.

## Overview

This feature allows users to download embedded files (images, PDFs, etc.) in HTML content and view the HTML offline with working local links.

---

## VERIFICATION CHECKLIST

### Must Verify Before Merging

- [ ] **File extraction works**: `extractCanvasFileReferences()` correctly finds Canvas file URLs in HTML
- [ ] **Missing file detection**: `resource:open` correctly identifies files not downloaded locally
- [ ] **Dialog appears**: `MissingDependenciesDialog` shows when opening HTML with missing files
- [ ] **Download works**: Clicking "Download All" downloads all missing files
- [ ] **HTML rewriting works**: After download, HTML is updated with relative local paths
- [ ] **File opens correctly**: HTML opens in default browser with working images/links
- [ ] **"Open Anyway" works**: Opens HTML even with missing files (broken images expected)
- [ ] **Cancel works**: Dialog closes without action

### Test Cases

1. **Open HTML with missing files** → Dialog should appear
2. **Open HTML with all files present** → Should open directly (no dialog)
3. **Download dependencies** → Files download, HTML rewritten, opens correctly
4. **Open Anyway** → Opens with Canvas URLs (needs internet)
5. **Cancel** → Dialog closes, file not opened

---

## What Was Implemented

### 1. IPC Handlers (main.ts)

| Handler | Status | Description |
|---------|--------|-------------|
| `resource:open` | **Modified** | Now parses HTML to find embedded file URLs, checks if they exist locally, returns missing files list |
| `html:checkDependencies` | **Added** | Checks dependencies without opening (uses HtmlDependencyResolver) |
| `html:downloadDependencies` | **Added** | Downloads missing files and rewrites HTML with relative local paths |

### 2. Preload API (preload.ts)

| Method | Status |
|--------|--------|
| `openResource(id, skipDependencyCheck?)` | **Modified** - Added optional skip parameter |
| `checkHtmlDependencies(id)` | **Added** |
| `downloadHtmlDependencies(id)` | **Added** |

### 3. UI Components

| Component | Status | Location |
|-----------|--------|----------|
| `MissingDependenciesDialog` | **Created** | `src/layers/l6-ui/components/Files/MissingDependenciesDialog.tsx` |
| `FilesPage.tsx` integration | **Modified** | Handles dialog state, download flow, open anyway |

### 4. URL Rewriting (HtmlContentSync.ts)

| Change | Status |
|--------|--------|
| `rewriteUrls()` uses relative paths instead of `canvas-file://` | **Modified** |

## What Needs to Be Verified

### Critical Checks

- [ ] **HTML file detection**: Does `resource:open` correctly identify HTML files?
- [ ] **File extraction**: Does `extractCanvasFileReferences()` find all embedded URLs in the HTML?
- [ ] **Missing file detection**: Are missing files correctly identified (not downloaded locally)?
- [ ] **Dialog appears**: Does `MissingDependenciesDialog` show when opening HTML with missing files?
- [ ] **Download works**: Does clicking "Download All" actually download the files?
- [ ] **HTML rewriting**: After download, is the HTML updated with relative local paths?
- [ ] **File opens correctly**: After download, does the HTML open in browser with working images?

### Known Issues / Gaps

1. **URL Extraction Scope**: `extractCanvasFileReferences()` may not catch all Canvas URL patterns:
   - File links: `/courses/{id}/files/{id}` - Should be caught
   - Page links: `/courses/{id}/pages/{slug}` - May not be caught
   - API endpoint URLs in data attributes - May not be caught

2. **Linked HTML Pages**: The current implementation handles embedded FILES but not linked HTML pages. If an HTML links to another page, that page won't be downloaded.

3. **URL Patterns in HTML**: The example Syllabus.html has these URL types:
   ```html
   <!-- File link - should be detected -->
   href="https://utoronto.instructure.com/courses/419166/files/41234356?verifier=..."

   <!-- Page links - may NOT be detected -->
   href="https://utoronto.instructure.com/courses/419166/pages/lecture-summaries"
   ```

4. **Resource Registration**: Files must exist in the `resources` table for download to work. If the file wasn't synced, it won't be in the database and can't be downloaded.

## Testing Steps

1. **Run the app**: `npm run dev`

2. **Open an HTML file** from Files page that has embedded resources

3. **Check logs** for:
   ```
   [resource:open] ext=.html, isHtml=true
   [resource:open] Found X file references in HTML
   [resource:open] Missing file: {fileId} - {filename}
   ```

4. **Dialog should appear** if files are missing

5. **Click "Download All"** and verify:
   - Files are downloaded
   - HTML is rewritten with local paths
   - HTML opens with working images

## Files Changed

```
src/main.ts                    - IPC handlers
src/preload.ts                 - API bridge
src/layers/l2-daemon/HtmlContentSync.ts - URL rewriting
src/layers/l6-ui/components/Files/MissingDependenciesDialog.tsx - New dialog
src/layers/l6-ui/components/Files/FilesPage.tsx - Dialog integration
```

## Next Steps If Not Working

1. **Add more logging** to trace the flow
2. **Check `extractCanvasFileReferences()`** pattern matching
3. **Verify resources exist** in database for embedded files
4. **Check file download** queue and completion events
5. **Inspect HTML content** after rewrite to verify URLs were replaced

---

## Potential Issues Identified

### 1. URL Rewriting Setting
- Default `htmlUrlRewriting` is `'original'` (keeps Canvas URLs)
- Changed to `'local'` is required for offline paths
- **Status**: Changed detection to parse HTML on-the-fly regardless of setting

### 2. File Must Exist in Resources Table
- For download to work, files must be in `resources` table with valid `url`
- If file wasn't synced, it won't have a download URL
- **May need**: Register missing files during sync or fetch URL on-demand

### 3. Page Links vs File Links
- Current implementation handles FILE links (`/courses/X/files/Y`)
- Does NOT handle PAGE links (`/courses/X/pages/slug`)
- Page links will still point to Canvas (need internet)

### 4. HTML Entity Encoding
- HTML may have `&amp;` instead of `&` in URLs
- Regex patterns should still match since file ID comes before query params

---

## Debug Commands

Check logs when opening HTML:
```
[resource:open] ext=.html, isHtml=true
[resource:open] Found X file references in HTML
[resource:open] Missing file: {fileId} - {filename}
[resource:open] HTML has X missing embedded files
```

If "Found 0 file references":
- Check if HTML content is being read correctly
- Check if regex patterns match the URL format in the HTML

---

## Related Files

| File | Changes |
|------|---------|
| `src/main.ts` | IPC handlers modified |
| `src/preload.ts` | API methods added |
| `src/layers/l2-daemon/HtmlContentSync.ts` | URL rewriting modified |
| `src/layers/l2-daemon/HtmlFileExtractor.ts` | File extraction (no changes, used as-is) |
| `src/layers/l6-ui/components/Files/MissingDependenciesDialog.tsx` | New component |
| `src/layers/l6-ui/components/Files/FilesPage.tsx` | Dialog integration |

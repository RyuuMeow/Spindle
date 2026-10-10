# Spindle 0.11.2

## Features
- A maintenance update for tab dragging, document deletion and multilingual dialogue editing.

## Fixes
- Tab insertion markers remain visible at the beginning of the strip. Dropping between tabs inserts at that gap instead of moving to the end; cancelling or dropping without a valid preview does not reorder tabs.
- Deleting a document preserves its tabs, order and pinned state. Each affected tab returns to its latest surviving previous document, or stays blank when there is no previous document. Opening a script reuses the blank tab.
- Chinese full-width punctuation no longer triggers the Source editor's ambiguous-character warning. Invisible-character highlighting remains enabled.

## Distribution
Unsigned Windows x64 Portable and NSIS installer. Includes all 0.11.1 fixes. See the verification report for completed checks and coverage limits.

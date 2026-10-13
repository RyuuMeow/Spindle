# Spindle 0.12.0

## Features
- Define paired or self-closing inline markup, with name and parameter completion, linked opening/closing edits and quick fixes across Source, Reading and Flowchart editors.
- Reading and Flowchart views display compact inline badges and configurable cycling colors. Solid range underlines stack for nested or overlapping markers; clicking a badge expands only its matching opening and closing source.
- Define command overloads and parameter constraints, with matching signatures, validation and completion.
- Customize inline name, parameter and delimiter syntax colors. Resize the command sidebar to fit longer signatures.

## Fixes
- Pure reading hides markup, commands and comments, trims leading/trailing blank rows and keeps at most one blank row between visible content. Source text and selections retain their original positions.
- Register unknown inline markup directly from its quick fix without leaving the editor.
- Prevent stale scene snapshots from being replayed in the Flowchart editor.

## Distribution
Unsigned Windows x64 Portable and NSIS installer. Includes the 0.11.2 fixes. See the verification report for completed checks and coverage limits.

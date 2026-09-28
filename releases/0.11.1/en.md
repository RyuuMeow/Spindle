# Spindle 0.11.1

## Features
- Compatibility patch: Play now accepts UTF-8 scripts with a leading byte-order mark (BOM).

## Fixes
- Fix a false “Nodes must have a title” compiler error when an invisible BOM precedes a valid title header.
- Preserve original text and source offsets, including cross-file playback, CRLF, Unicode dialogue and current-line entry. Only the leading encoding marker is treated as whitespace in the compiler input.

- Prevent the Source editor from duplicating the BOM during synchronized updates, which could incorrectly block restarting Play with the latest text.

## Distribution
Windows x64 Portable and NSIS are unsigned. All 0.11.0 features remain available. See the verification report for checks and untested scenarios.

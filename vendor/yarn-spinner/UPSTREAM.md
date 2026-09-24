# Yarn Spinner

Vendored compiler/runtime/diagnostic generator from MIT-licensed Yarn Spinner
v3.2.1, commit `3a5b7343f715e4e9a3705fa4224e7fa510b92f1c`.
Source: https://github.com/YarnSpinnerTool/YarnSpinner/tree/v3.2.1

Spindle additions are isolated in `SpindleDebug.cs`. The runtime class is made
partial, its instruction loop invokes a debug observer, and random selection
uses an optional process-local test source. No language evaluation rules change.
One helper process owns one Play session. Retain LICENSE.md when distributing.

# Play runtime notices

The official Yarn Spinner v3.2.1 compiler/runtime is MIT licensed; its license and
patched source are in `vendor/yarn-spinner`. Runtime dependencies are pinned in
`desktop/play-runtime/packages.lock.json`.

- ANTLR 4.13.1: BSD-3-Clause; `antlr4-4.13.1.txt`, from the upstream version tag.
- Google.Protobuf 3.25.2: BSD-3-Clause; `protobuf-3.25.2.txt`, from protobuf v25.2.
- CsvHelper 12.2.2: distributed under its Apache-2.0 option (the NuGet package offers
  MS-PL OR Apache-2.0). Copyright © 2009–2018 Josh Close and Contributors.
  See `csvhelper-apache-2.0.txt`.
- Microsoft .NET 10.0.12 runtime and its bundled Microsoft libraries: MIT, with
  additional notices in `dotnet-third-party-notices.txt`. These files are copied
  from the official `Microsoft.NETCore.App.Runtime.win-x64` NuGet package.

The .NET SDK is a build prerequisite, not an installed requirement for users.
The Portable includes the self-contained Windows x64 runtime. No agent
credentials, project content or build-time SDK are included.

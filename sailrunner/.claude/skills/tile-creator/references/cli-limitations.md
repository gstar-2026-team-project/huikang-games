# Bundle publishing limits

These limits apply to each uploaded bundle, including preview uploads. All
sizes use binary units: **1 MiB = 1,048,576 bytes**.

## Client/runtime bundles

The runtime bundle is the built `.tar.gz` uploaded for a tile. The platform
extracts any backend artifacts and produces the client bundle served to players.

| What is measured | Maximum | Meaning |
| --- | --- | --- |
| Total decompressed file data | 100 MiB (104,857,600 bytes) | Sum of the regular files' contents after decompression, excluding tar headers and padding. |
| Individual decompressed file | 20 MiB (20,971,520 bytes) | Contents of any one regular file after decompression. A phone hands a tile several copies of each asset it requests, so one large file costs more than the same bytes split up; split large data files into smaller ones. |
| File count | 1,000 | Regular file entries in the bundle. |
| Backend artifact | 8 MiB (8,388,608 bytes) | Decompressed size of `synced-store-backend-config.js`, the server-side code the platform loads into your tile's store. The build fails locally and publish rejects with a 400 naming the artifact and the limit. Reduce server code and bundled data, or move large assets to managed files. |
| Backend bytecode artifact | 12 MiB (12,582,912 bytes) | Decompressed size of `synced-store-backend-config.quickjs`, the compiled form of the backend artifact that production executes. |

The upload is refused as soon as the archive is found to exceed the first
three, before anything is stored; a small compressed archive can still exceed
the decompressed-data limit. The server also bounds the compressed archive,
but that bound is sized so it never refuses an archive within the limits
above. The two backend artifact limits are checked by the build and again
when the publish is committed. Runtime validation counts backend artifacts
before removing them from the client bundle, so they consume the uploaded
bundle's file-count and decompressed-data budgets too.

## Source archives

The optional source bundle is a separate `.tar.gz` containing project source,
not the client assets served to players. Its compressed upload/download limit
is **100 MiB (104,857,600 bytes)**, independent of the client/runtime bundle's
decompressed-data limit.

When building a source archive, the CLI also limits the selected files to
**100 MiB of total file contents before compression** and **50,000 files**,
after ignore rules. These are source-packaging checks in the CLI; the publish
API enforces the compressed source size without parsing it to enforce a source
file-count or decompressed-data limit. The client bundle's 1,000-file and
20 MiB-per-file limits do not apply to source archives.

These publishing limits do not grant additional browser cache allowance or
describe exact disk usage. A browser origin can cache multiple client bundles;
cache retention and physical storage overhead are separate concerns. See
[Publishing a tile](publishing.md) for the upload workflow.


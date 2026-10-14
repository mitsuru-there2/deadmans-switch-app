# Decoder compatibility copy

Source: official npm `decode-uri-component@0.5.0`, https://registry.npmjs.org/decode-uri-component/-/decode-uri-component-0.5.0.tgz (MIT; license retained).

The upstream malformed UTF-8 fix is unchanged. Two adapter edits preserve query-string 7 compatibility: `export default` becomes `module.exports`, and the original 0.2.x `+` → space normalization is retained. No remote source or dynamic code is executed. This local override can be removed when Expo Router consumes a compatible patched decoder. Tests cover the actual query-string consumer, valid Unicode, malformed bytes, and a large malformed run.

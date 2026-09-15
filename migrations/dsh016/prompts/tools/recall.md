Retrieve related long-term memories or the original events behind a condensed record.

Pass a natural-language `query`. Use `scope` only to narrow the session's allowed range: `all`, `global`, `cross`, or `project`.

To retrieve original events marked `seq a..b`, supply integer `from` and `to` and a `query` explaining the purpose. This route returns the original event text rather than another model-written summary. No matches means nothing was returned for this query or range, not that the fact never existed.

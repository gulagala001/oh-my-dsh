## Runtime state

Use the latest sample. Turn and step are host positions at sampling time, not live counters. Wall time includes tools and waiting. Retained tokens exclude pending input and new prompt assembly; a recorded model window is not remaining capacity or a deadline. Delivery means content was supplied, not that a job succeeded. Inspect job results before relying on them. Use `runtime_status` for fresh facts and the full job list only when they could change your next action.

"""Bounded, trial-local Responses history for a narrow upstream error fallback."""
from collections import OrderedDict
import json
import threading


class ResponseHistory:
    def __init__(self, max_bytes=32 * 1024 * 1024, max_entries=64):
        self.lock = threading.Lock()
        self.entries = OrderedDict()
        self.bytes = 0
        self.readback_omits_reasoning = False
        self.max_bytes, self.max_entries = max_bytes, max_entries

    def input_for(self, request):
        if not request or not isinstance(request.get('input'), list):
            return None
        previous = request.get('previous_response_id')
        if not previous:
            return request['input']
        with self.lock:
            if self.readback_omits_reasoning:
                # OMD may project old plain reasoning out of its native replay.
                # Without its full request, reconstructing it here would differ.
                return None
            found = self.entries.get(previous)
            return None if found is None else [*found[0], *request['input']]

    def observe_readback(self, response):
        output = response.get('output')
        if (response.get('status') == 'completed' and response.get('store') is True
                and isinstance(output, list) and output
                and all(not isinstance(item, dict) or item.get('type') != 'reasoning' for item in output)):
            with self.lock:
                self.readback_omits_reasoning = True

    def remember(self, response, inputs):
        if (inputs is None or response.get('status') != 'completed' or
                not isinstance(response.get('id'), str) or not isinstance(response.get('output'), list)):
            return
        items = [*inputs, *response['output']]
        size = len(json.dumps(items, ensure_ascii=False).encode())
        if size > self.max_bytes:
            return
        with self.lock:
            old = self.entries.pop(response['id'], None)
            if old:
                self.bytes -= old[1]
            self.entries[response['id']] = (items, size)
            self.bytes += size
            while self.bytes > self.max_bytes or len(self.entries) > self.max_entries:
                _, (_, removed) = self.entries.popitem(last=False)
                self.bytes -= removed


def known_bailian_continuation_error(status, payload):
    if status != 500 or not isinstance(payload, dict):
        return False
    error = payload.get('error', payload)
    return (isinstance(error, dict) and error.get('code') == 'InvalidParameter'
            and error.get('message') == "'str' object has no attribute 'get'")

import Foundation
import AppKit
import ApplicationServices

struct ElementRecord {
    let element: AXUIElement
    let targetId: String
    let generation: Int
}

final class AccessibilityStore {
    var elements: [Int: ElementRecord] = [:]
    var nextID = 1
    var generation = 0
    private let identityScope = UUID().uuidString

    func observe(_ target: [String: Any], targets: TargetStore, options: [String: Any]) throws -> [String: Any] {
        try requireAX()
        let root = target["windowId"] == nil ? AXUIElementCreateApplication(pid_t(target["pid"] as? Int ?? 0)) : try targets.axWindow(target)
        let id = target["id"] as? String ?? ""
        generation += 1
        let previous = Dictionary(grouping: elements.filter { $0.value.targetId == id }, by: { CFHash($0.value.element) })
        elements = elements.filter { $0.value.targetId != id }
        let current = generation
        let maxNodes = min(3000, max(1, options["maxNodes"] as? Int ?? 1000))
        let maxDepth = min(80, max(1, options["maxDepth"] as? Int ?? 40))
        let deadline = Date(timeIntervalSinceNow: min(15, max(0.1, (options["timeoutMs"] as? Double ?? 5000) / 1000)))
        AXUIElementSetMessagingTimeout(AXUIElementCreateApplication(pid_t(target["pid"] as? Int ?? 0)), 0.5)
        var lines: [String] = [], nodes: [[String: Any]] = [], visited: [CFHashCode: [AXUIElement]] = [:]
        var truncated = false
        func visit(_ element: AXUIElement, depth: Int, parentID: Int?) {
            if nodes.count >= maxNodes || depth > maxDepth || Date() > deadline { truncated = true; return }
            let hash = CFHash(element)
            if visited[hash]?.contains(where: { CFEqual($0, element) }) == true { return }
            visited[hash, default: []].append(element)
            let numericID: Int
            if let old = previous[hash]?.first(where: { CFEqual($0.value.element, element) }) { numericID = old.key }
            else { numericID = nextID; nextID += 1 }
            elements[numericID] = ElementRecord(element: element, targetId: id, generation: current)
            let role = axString(element, kAXRoleAttribute) ?? "AXUnknown"
            let title = axString(element, kAXTitleAttribute) ?? axString(element, kAXDescriptionAttribute) ?? ""
            var node: [String: Any] = ["id": numericID, "elementId": numericID, "role": role, "name": title]
            if let parentID = parentID { node["parentId"] = parentID }
            if !title.isEmpty { node["label"] = title }
            if let value = attribute(element, kAXValueAttribute) {
                if let text = value as? String { node["value"] = String(text.prefix(8000)) }
                else if let number = value as? NSNumber { node["value"] = number }
            }
            for name in [kAXEnabledAttribute, kAXFocusedAttribute, kAXSelectedAttribute] {
                if let value = attribute(element, name) as? NSNumber { node[name] = value }
            }
            if let rect = axRect(element) { node["bounds"] = rectJSON(rect) }
            var settable = DarwinBoolean(false)
            if AXUIElementIsAttributeSettable(element, kAXValueAttribute as CFString, &settable) == .success { node["valueSettable"] = settable.boolValue }
            var actions: CFArray?
            if AXUIElementCopyActionNames(element, &actions) == .success, let names = actions as? [String] { node["actions"] = names }
            nodes.append(node)
            let label = title.replacingOccurrences(of: "\n", with: " ")
            let value = node["value"].map { " value=\(String(describing: $0).prefix(500))" } ?? ""
            lines.append(String(repeating: "  ", count: depth) + "[\(numericID)] \(role) \(label)\(value)")
            for child in axElements(element, kAXChildrenAttribute) { visit(child, depth: depth + 1, parentID: numericID) }
        }
        visit(root, depth: 0, parentID: nil)
        return ["text": lines.joined(separator: "\n"), "nodes": nodes, "generation": current, "truncated": truncated,
                "stableIds": true, "identityScope": identityScope + ":" + id,
                "numericIds": "stable while the same element remains in this target; removed elements and helper restart invalidate IDs"]
    }

    func get(_ id: Int, target: [String: Any]) throws -> AXUIElement {
        guard let record = elements[id], record.targetId == target["id"] as? String else {
            throw NativeFailure("STALE_ELEMENT", "The numeric AX ID is not present in the latest observation of this target.", ["elementId": id])
        }
        var pid: pid_t = 0
        try checkedAX(AXUIElementGetPid(record.element, &pid), "verify element process")
        guard Int(pid) == target["pid"] as? Int else { throw NativeFailure("TARGET_IDENTITY_CHANGED", "Element belongs to a different process.") }
        // A destroyed AX element fails this live read, even when its process is still running.
        var role: CFTypeRef?
        try checkedAX(AXUIElementCopyAttributeValue(record.element, kAXRoleAttribute as CFString, &role), "verify element")
        return record.element
    }

    func hitTest(_ point: CGPoint, target: [String: Any], targets: TargetStore) throws -> [String: Any] {
        try requireAX()
        let root = AXUIElementCreateApplication(pid_t(target["pid"] as? Int ?? 0))
        var hit: AXUIElement?
        try checkedAX(AXUIElementCopyElementAtPosition(root, Float(point.x), Float(point.y), &hit), "hit test element")
        guard let element = hit else { throw NativeFailure("ELEMENT_NOT_FOUND", "No accessibility element at this screenshot point.") }
        var pid: pid_t = 0
        try checkedAX(AXUIElementGetPid(element, &pid), "verify hit process")
        guard Int(pid) == target["pid"] as? Int else { throw NativeFailure("TARGET_IDENTITY_CHANGED", "Hit element belongs to another application.") }
        try verifyWindow(element, target: target, targets: targets)
        let numericID = nextID; nextID += 1
        elements[numericID] = ElementRecord(element: element, targetId: target["id"] as? String ?? "", generation: generation)
        var result: [String: Any] = ["kind": "element", "elementId": numericID, "runtimeElementId": numericID,
            "role": axString(element, kAXRoleAttribute) ?? "AXUnknown", "name": axString(element, kAXTitleAttribute) ?? axString(element, kAXDescriptionAttribute) ?? ""]
        if let rect = axRect(element) { result["bounds"] = rectJSON(rect) }
        return result
    }

    func setValue(_ id: Int, target: [String: Any], value: Any) throws {
        try requireAX()
        let element = try get(id, target: target)
        var settable = DarwinBoolean(false)
        try checkedAX(AXUIElementIsAttributeSettable(element, kAXValueAttribute as CFString, &settable), "check value is settable")
        guard settable.boolValue else { throw NativeFailure("AX_VALUE_NOT_SETTABLE", "The selected element does not support AX value assignment.") }
        try checkedAX(AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, value as CFTypeRef), "set value")
    }

    func press(_ id: Int, target: [String: Any]) throws {
        try requireAX()
        try checkedAX(AXUIElementPerformAction(try get(id, target: target), kAXPressAction as CFString), "press element")
    }

    func verifyWindow(_ element: AXUIElement, target: [String: Any], targets: TargetStore) throws {
        guard target["windowId"] != nil else { return }
        let window = try targets.axWindow(target)
        var node = element
        for _ in 0..<80 {
            if CFEqual(node, window) { return }
            guard let parent = attribute(node, kAXParentAttribute), CFGetTypeID(parent) == AXUIElementGetTypeID() else { break }
            node = unsafeBitCast(parent, to: AXUIElement.self)
        }
        throw NativeFailure("TARGET_IDENTITY_CHANGED", "The selected element is outside the target window.")
    }

    func pressable(_ id: Int, target: [String: Any], targets: TargetStore) throws -> AXUIElement? {
        try requireAX()
        let element = try get(id, target: target)
        try verifyWindow(element, target: target, targets: targets)
        var node = element
        for _ in 0..<80 {
            let role = axString(node, kAXRoleAttribute) ?? ""
            if [kAXRowRole, kAXWindowRole, kAXApplicationRole].contains(role) { return nil }
            if [kAXButtonRole, kAXCheckBoxRole, kAXRadioButtonRole, kAXPopUpButtonRole, kAXMenuButtonRole, "AXLink"].contains(role) {
                guard (attribute(node, kAXEnabledAttribute) as? NSNumber)?.boolValue != false else {
                    throw NativeFailure("ELEMENT_DISABLED", "The selected control is disabled; no input was sent.")
                }
                var actions: CFArray?
                try checkedAX(AXUIElementCopyActionNames(node, &actions), "read element actions")
                return (actions as? [String] ?? []).contains(kAXPressAction) ? node : nil
            }
            guard let parent = attribute(node, kAXParentAttribute), CFGetTypeID(parent) == AXUIElementGetTypeID() else { return nil }
            node = unsafeBitCast(parent, to: AXUIElement.self)
        }
        return nil
    }

    func selectableRow(_ id: Int, target: [String: Any], targets: TargetStore) throws -> AXUIElement? {
        let element = try get(id, target: target)
        guard [kAXRowRole, kAXCellRole, kAXStaticTextRole].contains(axString(element, kAXRoleAttribute) ?? "") else { return nil }
        let window = try targets.axWindow(target)
        var node = element, row: AXUIElement?
        for _ in 0..<80 {
            if CFEqual(node, window) {
                guard let row = row else { return nil }
                var settable = DarwinBoolean(false)
                try checkedAX(AXUIElementIsAttributeSettable(row, kAXSelectedAttribute as CFString, &settable), "check row selection is settable")
                guard settable.boolValue else { throw NativeFailure("BACKGROUND_SELECTION_UNAVAILABLE", "The selected row does not support background AX selection; no pointer input was sent.") }
                return row
            }
            if row == nil && axString(node, kAXRoleAttribute) == kAXRowRole { row = node }
            guard let parent = attribute(node, kAXParentAttribute), CFGetTypeID(parent) == AXUIElementGetTypeID() else { break }
            node = unsafeBitCast(parent, to: AXUIElement.self)
        }
        throw NativeFailure("TARGET_IDENTITY_CHANGED", "The selected row is outside the target window.")
    }

    func center(_ id: Int, target: [String: Any]) throws -> CGPoint {
        try requireAX()
        guard let bounds = axRect(try get(id, target: target)), bounds.width > 0, bounds.height > 0 else {
            throw NativeFailure("ELEMENT_NOT_VISIBLE", "AX element has no usable screen bounds.")
        }
        return CGPoint(x: bounds.midX, y: bounds.midY)
    }
}

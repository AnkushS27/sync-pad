import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { applyVersionAsYjsEdit } from "../lib/sync/restore-helper";

describe("Restore Logic Unit Tests", () => {
  it("should replace the content of live document with the target snapshot using CRDT operations", () => {
    // 1. Create a live doc and write initial state
    const liveDoc = new Y.Doc();
    const liveFragment = liveDoc.getXmlFragment("default");

    const p1 = new Y.XmlElement("paragraph");
    const t1 = new Y.XmlText("Hello live document!");
    p1.insert(0, [t1]);
    liveFragment.insert(0, [p1]);

    const currentState = Y.encodeStateAsUpdate(liveDoc);

    // 2. Create a target doc representing the snapshot to restore
    const targetDoc = new Y.Doc();
    const targetFragment = targetDoc.getXmlFragment("default");

    const p2 = new Y.XmlElement("paragraph");
    const t2 = new Y.XmlText("Hello target version!");
    p2.insert(0, [t2]);

    const p3 = new Y.XmlElement("paragraph");
    const t3 = new Y.XmlText("Added line");
    p3.insert(0, [t3]);

    targetFragment.insert(0, [p2, p3]);

    const targetSnapshot = Y.encodeStateAsUpdate(targetDoc);

    // 3. Apply the restore
    const { state, stateVector } = applyVersionAsYjsEdit(currentState, targetSnapshot);

    // 4. Verify that the returned state update matches targetDoc contents when applied
    const resultDoc = new Y.Doc();
    Y.applyUpdate(resultDoc, state);
    const resultFragment = resultDoc.getXmlFragment("default");

    expect(resultFragment.length).toBe(2);
    expect(resultFragment.toString()).toBe(
      "<paragraph>Hello target version!</paragraph><paragraph>Added line</paragraph>",
    );

    // 5. Verify convergence with a concurrent edit
    // Simulate: live user types " concurrent" in the first paragraph of liveDoc BEFORE restore updates arrive
    const liveDocConcurrent = new Y.Doc();
    Y.applyUpdate(liveDocConcurrent, currentState);

    const liveFragmentConcurrent = liveDocConcurrent.getXmlFragment("default");
    const firstP = liveFragmentConcurrent.get(0) as Y.XmlElement;
    const firstTextNode = firstP.get(0) as Y.XmlText;
    firstTextNode.insert(6, " concurrent"); // inserts " concurrent" after "Hello " -> "Hello concurrent live document!"

    const concurrentUpdate = Y.encodeStateAsUpdate(liveDocConcurrent);

    // Now merge the restore update AND the concurrent update
    const mergedDoc = new Y.Doc();
    Y.applyUpdate(mergedDoc, currentState);

    // Apply concurrent update
    Y.applyUpdate(mergedDoc, concurrentUpdate);
    // Apply restore update
    Y.applyUpdate(mergedDoc, state);

    // Assert that the restore replaced the structure, but Yjs causal order is maintained.
    const mergedFragment = mergedDoc.getXmlFragment("default");
    expect(mergedFragment.toString()).toContain("Hello target version!");
  });

  it("should handle initial empty live doc state gracefully", () => {
    // 1. Live doc is empty
    const currentState = null;

    // 2. Target doc
    const targetDoc = new Y.Doc();
    const targetFragment = targetDoc.getXmlFragment("default");
    const p = new Y.XmlElement("paragraph");
    const t = new Y.XmlText("Restored text");
    p.insert(0, [t]);
    targetFragment.insert(0, [p]);
    const targetSnapshot = Y.encodeStateAsUpdate(targetDoc);

    // 3. Restore
    const { state } = applyVersionAsYjsEdit(currentState, targetSnapshot);

    // 4. Verify
    const resultDoc = new Y.Doc();
    Y.applyUpdate(resultDoc, state);
    const resultFragment = resultDoc.getXmlFragment("default");
    expect(resultFragment.toString()).toBe("<paragraph>Restored text</paragraph>");
  });
});

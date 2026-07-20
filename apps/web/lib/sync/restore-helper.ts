import * as Y from "yjs";

function patchText(liveText: Y.XmlText, targetStr: string) {
  const liveStr = liveText.toString();
  if (liveStr === targetStr) return;

  // Find common prefix
  let prefixLen = 0;
  while (
    prefixLen < liveStr.length &&
    prefixLen < targetStr.length &&
    liveStr[prefixLen] === targetStr[prefixLen]
  ) {
    prefixLen++;
  }

  // Find common suffix
  let suffixLen = 0;
  while (
    suffixLen < liveStr.length - prefixLen &&
    suffixLen < targetStr.length - prefixLen &&
    liveStr[liveStr.length - 1 - suffixLen] === targetStr[targetStr.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const deleteLen = liveStr.length - prefixLen - suffixLen;
  const insertText = targetStr.slice(prefixLen, targetStr.length - suffixLen);

  if (deleteLen > 0) {
    liveText.delete(prefixLen, deleteLen);
  }
  if (insertText.length > 0) {
    liveText.insert(prefixLen, insertText);
  }
}

function patchFragment(liveFragment: Y.XmlFragment, targetFragment: Y.XmlFragment) {
  const liveNodes = liveFragment
    .toArray()
    .filter(
      (n): n is Y.XmlElement | Y.XmlText => n instanceof Y.XmlElement || n instanceof Y.XmlText,
    );
  const targetNodes = targetFragment
    .toArray()
    .filter(
      (n): n is Y.XmlElement | Y.XmlText => n instanceof Y.XmlElement || n instanceof Y.XmlText,
    );

  const minLen = Math.min(liveNodes.length, targetNodes.length);

  // 1. Patch matching nodes
  for (let i = 0; i < minLen; i++) {
    const liveNode = liveNodes[i];
    const targetNode = targetNodes[i];

    if (
      liveNode instanceof Y.XmlElement &&
      targetNode instanceof Y.XmlElement &&
      liveNode.nodeName === targetNode.nodeName
    ) {
      // Recursive structural patch or text child patch
      const liveText = liveNode.get(0);
      const targetText = targetNode.get(0);
      if (liveText instanceof Y.XmlText && targetText instanceof Y.XmlText) {
        patchText(liveText, targetText.toString());
      }
    } else if (liveNode instanceof Y.XmlText && targetNode instanceof Y.XmlText) {
      patchText(liveNode, targetNode.toString());
    } else {
      // Replace node structurally if they differ in type
      const idx = liveFragment.toArray().indexOf(liveNode);
      if (idx !== -1) {
        liveFragment.delete(idx, 1);
        liveFragment.insert(idx, [targetNode.clone()]);
      }
    }
  }

  // 2. Add extra nodes from target
  if (targetNodes.length > liveNodes.length) {
    const extraNodes = targetNodes.slice(liveNodes.length).map((n) => n.clone());
    liveFragment.insert(liveFragment.length, extraNodes);
  }

  // 3. Remove extra nodes from live
  if (liveNodes.length > targetNodes.length) {
    const extraLive = liveNodes.slice(targetNodes.length);
    for (const node of extraLive) {
      const idx = liveFragment.toArray().indexOf(node);
      if (idx !== -1) {
        liveFragment.delete(idx, 1);
      }
    }
  }
}

export function applyVersionAsYjsEdit(currentState: Uint8Array | null, targetSnapshot: Uint8Array) {
  const liveDoc = new Y.Doc();
  if (currentState) {
    Y.applyUpdate(liveDoc, currentState);
  }

  const targetDoc = new Y.Doc();
  Y.applyUpdate(targetDoc, targetSnapshot);

  const liveFragment = liveDoc.getXmlFragment("default");
  const targetFragment = targetDoc.getXmlFragment("default");

  liveDoc.transact(() => {
    patchFragment(liveFragment, targetFragment);
  }, "version-restore");

  return {
    state: Buffer.from(Y.encodeStateAsUpdate(liveDoc)),
    stateVector: Buffer.from(Y.encodeStateVector(liveDoc)),
  };
}

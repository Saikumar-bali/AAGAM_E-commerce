'use client';

import { useEffect } from 'react';

const normalizeBrand = (value: string) => value
  .replace(/AAGAM/g, 'AAGAAM')
  .replace(/Aagam/g, 'Aagaam');

function normalizeElement(element: Element) {
  for (const attribute of ['aria-label', 'alt', 'placeholder', 'title']) {
    const current = element.getAttribute(attribute);
    if (current && /AAGAM|Aagam/.test(current)) element.setAttribute(attribute, normalizeBrand(current));
  }
}

function normalizeTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    const text = root.textContent;
    if (text && /AAGAM|Aagam/.test(text)) root.textContent = normalizeBrand(text);
    return;
  }
  if (!(root instanceof Element)) return;
  if (['SCRIPT', 'STYLE', 'CODE', 'PRE'].includes(root.tagName)) return;
  normalizeElement(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (text && /AAGAM|Aagam/.test(text)) node.textContent = normalizeBrand(text);
    } else if (node instanceof Element && !['SCRIPT', 'STYLE', 'CODE', 'PRE'].includes(node.tagName)) {
      normalizeElement(node);
    }
    node = walker.nextNode();
  }
}

/**
 * Compatibility layer for legacy page copy while internal package names and API
 * identifiers remain stable. New components should use Aagaam directly.
 */
export default function AagaamBrandMigration() {
  useEffect(() => {
    normalizeTree(document.body);
    document.title = normalizeBrand(document.title);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach(normalizeTree);
        if (record.type === 'characterData') normalizeTree(record.target);
        if (record.type === 'attributes' && record.target instanceof Element) normalizeElement(record.target);
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'alt', 'placeholder', 'title'],
    });
    return () => observer.disconnect();
  }, []);
  return null;
}

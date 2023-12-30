import { isDev } from '@builder.io/qwik/build';
import { assertDefined, assertFalse, assertTrue } from '../../core/error/assert';
import { throwErrorAndStop } from '../../core/util/log';
import {
  Flags,
  VNodeProps,
  type ContainerElement,
  type ElementVNode,
  type FragmentVNode,
  type QDocument,
  type TextVNode,
  type VNode,
} from './types';

//////////////////////////////////////////////////////////////////////////////////////////////////////

export const vnode_newElement = (parentNode: VNode | null, element: Element): ElementVNode => {
  const vnode: ElementVNode = [
    Flags.DeflatedElement,
    parentNode as VNode | null,
    undefined,
    undefined,
    element,
    undefined,
  ] as any;
  if (isDev) {
    (vnode as any).toString = vnode_toString;
  }
  assertTrue(vnode_isElementVNode(vnode), 'Incorrect format of ElementVNode.');
  assertFalse(vnode_isTextVNode(vnode), 'Incorrect format of ElementVNode.');
  assertFalse(vnode_isFragmentVNode(vnode), 'Incorrect format of ElementVNode.');
  return vnode as unknown as ElementVNode;
};

export const vnode_newDeflatedText = (
  parentNode: VNode,
  previousTextNode: TextVNode | null,
  sharedTextNode: Text | null,
  textContent: string
): TextVNode => {
  const vnode: TextVNode = [
    Flags.DeflatedText, // Flag
    parentNode, // Parent
    null, // Next sibling
    previousTextNode, // Previous TextNode (usually first child)
    sharedTextNode, // SharedTextNode
    textContent, // Text Content
  ] as any;
  if (isDev) {
    (vnode as any).toString = vnode_toString;
  }
  assertFalse(vnode_isElementVNode(vnode), 'Incorrect format of TextVNode.');
  assertTrue(vnode_isTextVNode(vnode), 'Incorrect format of TextVNode.');
  assertFalse(vnode_isFragmentVNode(vnode), 'Incorrect format of TextVNode.');
  return vnode as unknown as TextVNode;
};

export const vnode_newInflatedText = (
  parentNode: VNode,
  textNode: Text,
  textContent: string
): TextVNode => {
  const vnode: TextVNode = [
    Flags.InflatedText, // Flags
    parentNode, // Parent
    undefined, // We may have a next sibling.
    null, // No previous TextNode because we ere inflated
    textNode, // TextNode
    textContent, // Text Content
  ] as any;
  if (isDev) {
    (vnode as any).toString = vnode_toString;
  }
  assertFalse(vnode_isElementVNode(vnode), 'Incorrect format of TextVNode.');
  assertTrue(vnode_isTextVNode(vnode), 'Incorrect format of TextVNode.');
  assertFalse(vnode_isFragmentVNode(vnode), 'Incorrect format of TextVNode.');
  return vnode as unknown as TextVNode;
};

export const vnode_newFragment = (parentNode: VNode): FragmentVNode => {
  const vnode: TextVNode = [Flags.Fragment, parentNode, null, null] as any;
  if (isDev) {
    (vnode as any).toString = vnode_toString;
  }
  assertFalse(vnode_isElementVNode(vnode), 'Incorrect format of TextVNode.');
  assertFalse(vnode_isTextVNode(vnode), 'Incorrect format of TextVNode.');
  assertTrue(vnode_isFragmentVNode(vnode), 'Incorrect format of TextVNode.');
  return vnode as unknown as FragmentVNode;
};

//////////////////////////////////////////////////////////////////////////////////////////////////////

export const vnode_isElementVNode = (vNode: VNode | null | undefined): vNode is ElementVNode => {
  if (!vNode) {
    return false;
  }
  const flag = (vNode as VNode)[VNodeProps.flags];
  return (flag & Flags.DeflatedElement) === Flags.DeflatedElement;
};

export const vnode_isTextVNode = (vNode: VNode | null | undefined): vNode is TextVNode => {
  if (!vNode) {
    return false;
  }
  const flag = (vNode as VNode)[VNodeProps.flags];
  return (flag & Flags.DeflatedText) === Flags.DeflatedText;
};

export const vnode_isFragmentVNode = (vNode: VNode | null | undefined): vNode is FragmentVNode => {
  if (!vNode) {
    return false;
  }
  const flag = (vNode as VNode)[VNodeProps.flags];
  return flag === Flags.Fragment;
};

const ensureTextVNode = (vNode: VNode | null): TextVNode => {
  assertTrue(
    vnode_isTextVNode(vNode),
    'Expecting TextVNode was: ' + (vNode && vNode[VNodeProps.flags])
  );
  return vNode as TextVNode;
};

const ensureFragmentVNode = (vNode: VNode | null): FragmentVNode => {
  assertTrue(
    vnode_isElementVNode(vNode),
    'Expecting FragmentVNode was: ' + (vNode && vNode[VNodeProps.flags])
  );
  return vNode as FragmentVNode;
};

const ensureElementVNode = (vNode: VNode | null): ElementVNode => {
  assertTrue(
    vnode_isElementVNode(vNode),
    'Expecting ElementVNode was: ' + (vNode && vNode[VNodeProps.flags])
  );
  return vNode as ElementVNode;
};

const ensureInflatedElementVNode = (vnode: VNode | null) => {
  const elementVNode = ensureElementVNode(vnode);
  const flags = elementVNode[VNodeProps.flags];
  if (flags === Flags.DeflatedElement) {
    elementVNode[VNodeProps.flags] = Flags.InflatedElement;
    const element = elementVNode[VNodeProps.node];
    const attributes = element.attributes;
    for (let idx = 0; idx < attributes.length; idx++) {
      const attr = attributes[idx];
      const key = attr.name;
      const value = attr.value;
      mapArray_set(elementVNode, key, value);
    }
  }
  return elementVNode;
};

const vnode_getDOMParent = (vnode: VNode): Element | null => {
  while (vnode && !vnode_isElementVNode(vnode)) {
    vnode = vnode[VNodeProps.parent];
  }
  return vnode && vnode[VNodeProps.node];
};

const vnode_getDOMInsertBefore = (vnode: VNode | null): Node | null => {
  while (vnode && !vnode_isElementVNode(vnode)) {
    vnode = vnode[VNodeProps.nextSibling];
  }
  return vnode && vnode[VNodeProps.node];
};

const ensureInflatedTextVNode = (vnode: VNode): TextVNode => {
  const textVNode = ensureTextVNode(vnode);
  const flags = textVNode[VNodeProps.flags];
  if (flags === Flags.DeflatedText) {
    // Find the first TextVNode
    let firstTextVnode = vnode;
    while (true as boolean) {
      const previous = firstTextVnode[VNodeProps.firstChildOrPreviousText];
      if (vnode_isTextVNode(previous)) {
        firstTextVnode = previous;
      } else {
        break;
      }
    }
    // Find the last TextVNode
    let lastTextVnode = vnode;
    while (true as boolean) {
      const next = lastTextVnode[VNodeProps.nextSibling];
      if (vnode_isTextVNode(next)) {
        lastTextVnode = next;
      } else {
        break;
      }
    }
    // iterate over each text node and inflate it.
    const parentNode = vnode_getDOMParent(vnode)!;
    assertDefined(parentNode, 'Missing parentNode.');
    const qDocument = parentNode.ownerDocument as QDocument;
    let existingTextNode = lastTextVnode[VNodeProps.node] as Text | null;
    const lastText = lastTextVnode[VNodeProps.tagOrContent] as string;
    if (existingTextNode === null) {
      const insertBeforeNode = vnode_getDOMInsertBefore(vnode_getNextSibling(lastTextVnode));
      existingTextNode = lastTextVnode[VNodeProps.node] = qDocument.createTextNode(lastText);
      parentNode.insertBefore(existingTextNode, insertBeforeNode);
    } else {
      existingTextNode.nodeValue = lastText;
    }
    while (firstTextVnode !== lastTextVnode) {
      const textNode = (firstTextVnode[VNodeProps.node] = qDocument.createTextNode(
        firstTextVnode[VNodeProps.tagOrContent] as string
      ));
      parentNode.insertBefore(textNode, existingTextNode);
      firstTextVnode = firstTextVnode[VNodeProps.nextSibling] as TextVNode;
      firstTextVnode[VNodeProps.flags] = Flags.InflatedText;
    }
    lastTextVnode[VNodeProps.flags] = Flags.InflatedText;
    textVNode[VNodeProps.flags] = Flags.InflatedText;
  }
  return textVNode;
};

export const vnode_locate = (rootVNode: ElementVNode, id: string): VNode => {
  ensureElementVNode(rootVNode);
  let vNode: VNode = rootVNode;
  const containerElement = rootVNode[VNodeProps.node] as ContainerElement;
  const { qVNodeRefs } = containerElement;
  assertDefined(qVNodeRefs, 'Missing qVNodeRefs.');
  const elementOffset = parseInt(id);
  const refElement = qVNodeRefs.get(elementOffset)!;
  assertDefined(refElement, 'Missing refElement.');
  if (!Array.isArray(refElement)) {
    // We need to find the vnode.
    let parent = refElement;
    const elementPath: Element[] = [refElement];
    while (parent && parent !== containerElement) {
      parent = parent.parentElement!;
      elementPath.push(parent);
    }
    // Start at rootVNode and fallow the `elementPath` to find the vnode.
    for (let i = elementPath.length - 2; i >= 0; i--) {
      vNode = vnode_getVNodeForChildNode(vNode, elementPath[i]);
    }
    qVNodeRefs.set(elementOffset, vNode);
  }
  // process virtual node search.
  const idLength = id.length;
  let idx = indexOfAlphanumeric(id, idLength);
  let nthChildIdx = 0;
  while (idx < idLength) {
    const ch = id.charCodeAt(idx);
    nthChildIdx *= 26 /* a-z */;
    if (ch >= 97 /* a */) {
      // is lowercase
      nthChildIdx += ch - 97 /* a */;
    } else {
      // is uppercase
      nthChildIdx += ch - 65 /* A */;
      vNode = vnode_getNthChild(vNode, nthChildIdx);
      nthChildIdx = 0;
    }
    idx++;
  }
  return vNode;
};

const vnode_getNthChild = (vNode: VNode, nthChildIdx: number): VNode => {
  let child = vnode_getFirstChild(vNode);
  assertDefined(child, 'Missing child.');
  while (nthChildIdx--) {
    child = vnode_getNextSibling(child);
    assertDefined(child, 'Missing child.');
  }
  return child;
};

const vnode_getVNodeForChildNode = (vNode: ElementVNode, childNode: Element): ElementVNode => {
  ensureElementVNode(vNode);
  let child = vnode_getFirstChild(vNode);
  assertDefined(child, 'Missing child.');
  console.log(
    'SEARCHING',
    child[VNodeProps.flags],
    child[VNodeProps.node]?.outerHTML,
    childNode.outerHTML
  );
  while (child[VNodeProps.node] !== childNode) {
    console.log('CHILD', child[VNodeProps.node]?.outerHTML, childNode.outerHTML);
    child = vnode_getNextSibling(child);
    assertDefined(child, 'Missing child.');
  }
  ensureElementVNode(child);
  console.log('FOUND', child[VNodeProps.node]?.outerHTML);
  return child as ElementVNode;
};

const indexOfAlphanumeric = (id: string, length: number): number => {
  let idx = 0;
  while (idx < length) {
    if (id.charCodeAt(idx) <= 57 /* 9 */) {
      idx++;
    } else {
      return idx;
    }
  }
  return length;
};

//////////////////////////////////////////////////////////////////////////////////////////////////////

const mapApp_findIndx = (elementVNode: ElementVNode, key: string): number => {
  assertTrue(VNodeProps.propsStart % 2 === 0, 'Expecting even number.');
  let bottom = (VNodeProps.propsStart as number) >> 1;
  let top = (elementVNode.length - 2) >> 1;
  while (bottom <= top) {
    const mid = bottom + ((top - bottom) >> 1);
    const midKey = elementVNode[mid << 1] as string;
    if (midKey === key) {
      return mid << 1;
    }
    if (midKey < key) {
      bottom = mid + 1;
    } else {
      top = mid - 1;
    }
  }
  return (bottom << 1) ^ -1;
};

const mapArray_set = (elementVNode: ElementVNode, key: string, value: string) => {
  const indx = mapApp_findIndx(elementVNode, key);
  if (indx >= 0) {
    return (elementVNode[indx + 1] = value);
  } else {
    elementVNode.splice(indx ^ -1, 0, key, value);
  }
};

const mapArray_get = (elementVNode: ElementVNode, key: string): string | null => {
  const indx = mapApp_findIndx(elementVNode, key);
  if (indx >= 0) {
    return elementVNode[indx + 1] as string | null;
  } else {
    return null;
  }
};

//////////////////////////////////////////////////////////////////////////////////////////////////////

export const vnode_getElementName = (vnode: ElementVNode): string => {
  const elementVNode = ensureElementVNode(vnode);
  let value = elementVNode[VNodeProps.tagOrContent];
  if (value === undefined) {
    value = elementVNode[VNodeProps.tagOrContent] =
      elementVNode[VNodeProps.node].nodeName.toLowerCase();
  }
  return value;
};

export const vnode_getText = (vnode: TextVNode): string => {
  const textVNode = ensureTextVNode(vnode);
  let value = textVNode[VNodeProps.tagOrContent];
  if (value === undefined) {
    value = textVNode[VNodeProps.tagOrContent] = textVNode[VNodeProps.node]!.nodeValue!;
  }
  return value;
};

export const vnode_setText = (vnode: TextVNode, text: string) => {
  const textVNode = ensureInflatedTextVNode(vnode);
  const textNode = textVNode[VNodeProps.node]!;
  textNode.nodeValue = textVNode[VNodeProps.tagOrContent] = text;
};

export const vnode_getFirstChild = (vnode: VNode): VNode | null => {
  let value = vnode[VNodeProps.firstChildOrPreviousText];
  if (value === undefined) {
    const elementNode = ensureElementVNode(vnode);
    const node = elementNode[VNodeProps.node];
    const firstChild = node.firstChild;
    value = vnode_fromNode(elementNode, firstChild);
    vnode[VNodeProps.firstChildOrPreviousText] = value;
  }
  return value;
};

export const vnode_setFirstChild = (
  vnode: ElementVNode | FragmentVNode | TextVNode,
  firstChild: VNode | null
) => {
  vnode[VNodeProps.firstChildOrPreviousText] = firstChild as VNode | null;
};

export const vnode_getNextSibling = (vnode: VNode): VNode | null => {
  let value = vnode[VNodeProps.nextSibling];
  if (value === undefined) {
    assertTrue(!vnode_isFragmentVNode(vnode), 'Unexpected location of FragmentVNode.');
    const node = vnode[VNodeProps.node] as Node;
    const nextSibling = node.nextSibling;
    if (nextSibling) {
      const parentVNode = vnode[VNodeProps.parent];
      if (parentVNode) {
        value = vnode_fromNode(ensureElementVNode(parentVNode), nextSibling);
      }
    }
    value = value || null;
    vnode[VNodeProps.nextSibling] = value;
  }
  return value;
};

export const vnode_setNextSibling = (vnode: VNode, next: VNode | null) => {
  vnode[VNodeProps.nextSibling] = next;
};

export const vnode_getPropKeys = (vnode: VNode): string[] => {
  if (vnode_isFragmentVNode(vnode)) {
    return [];
  }
  const element = ensureInflatedElementVNode(vnode);
  const keys: string[] = [];
  for (let i = VNodeProps.propsStart; i < element.length; i = i + 2) {
    keys.push(element[i] as string);
  }
  return keys;
};

export const vnode_getProp = (vnode: VNode, key: string): string | null => {
  const element = ensureInflatedElementVNode(vnode);
  // console.log('VNODE', vnode.toString());
  return mapArray_get(element, key);
};

const vnode_fromNode = (parentVNode: ElementVNode, node: Node | null): VNode | null => {
  if (node) {
    const qDocument = node.ownerDocument as QDocument;
    const parentNode = parentVNode[VNodeProps.node];
    const vNodeData = qDocument.qVNodeData.get(parentNode);
    // console.log('vNodeData:', vNodeData, vnode_toString(parentNode));
    if (vNodeData) {
      return processVNodeData(parentVNode, vNodeData, node);
    } else if (node.nodeType === /* Node.TEXT_NODE */ 3) {
      return vnode_newInflatedText(parentVNode, node as Text, node.nodeValue!);
    } else {
      return vnode_newElement(parentVNode, node as Element);
    }
  }
  return null;
};
export function vnode_toString(
  this: VNode | null,
  depth: number = 3,
  offset: string = '',
  includeSiblings: boolean = false
): string {
  let vnode = this;
  if (depth === 0) {
    return '...';
  }
  if (vnode === null) {
    return 'null';
  }
  if (vnode === undefined) {
    return 'undefined';
  }
  const strings: string[] = [];
  do {
    if (vnode_isTextVNode(vnode)) {
      strings.push(JSON.stringify(vnode_getText(vnode)));
    } else if (vnode_isFragmentVNode(vnode)) {
      strings.push('<>');
      const child = vnode_getFirstChild(vnode);
      child && strings.push('  ' + vnode_toString.call(child, depth - 1, offset + '  ', true));
      strings.push('</>');
    } else if (vnode_isElementVNode(vnode)) {
      const tag = vnode_getElementName(vnode);
      strings.push('<' + tag + '>');
      const child = vnode_getFirstChild(vnode);
      child && strings.push('  ' + vnode_toString.call(child, depth - 1, offset + '  ', true));
      strings.push('</' + tag + '>');
    }
    vnode = (includeSiblings && vnode ? (vnode as VNode)[VNodeProps.nextSibling] : null) || null;
  } while (vnode);
  return strings.join('\n' + offset);
}

const isNumber = (ch: number) => /* `0` */ 48 <= ch && ch <= 57; /* `9` */
const isLowercase = (ch: number) => /* `a` */ 97 <= ch && ch <= 122; /* `z` */

const stack: any[] = [];
function processVNodeData(parentVNode: ElementVNode, vNodeData: string, child: Node | null): VNode {
  let nextToConsumeIdx = 0;
  let firstVNode: VNode | null = null;
  let lastVNode: VNode | null = null;
  let previousTextNode: TextVNode | null = null;
  let ch = 0;
  let peekCh = 0;
  const peek = () => {
    if (peekCh !== 0) {
      return peekCh;
    } else {
      return (peekCh =
        nextToConsumeIdx < vNodeData!.length ? vNodeData!.charCodeAt(nextToConsumeIdx) : 0);
    }
  };
  const consume = () => {
    ch = peek();
    peekCh = 0;
    nextToConsumeIdx++;
    return ch;
  };
  const addVNode = (node: VNode) => {
    firstVNode = firstVNode || node;
    lastVNode && vnode_setNextSibling(lastVNode, node);
    lastVNode = node;
  };

  let textIdx = 0;
  let combinedText: string | null = null;
  while (peek() !== 0) {
    if (isNumber(peek())) {
      // Element counts get encoded as numbers.
      while (!isElement(child)) {
        child = child!.nextSibling;
        if (!child) {
          throwErrorAndStop('Inflation error: missing element.', parent, vNodeData);
        }
      }
      combinedText = null;
      previousTextNode = null;
      let value = 0;
      while (isNumber(peek())) {
        value *= 10;
        value += consume() - 48; /* `0` */
      }
      while (value--) {
        addVNode(vnode_newElement(parentVNode, child as Element));
        child = child!.nextSibling;
      }
      // collect the elements;
    } else if (peek() === 123 /* `{` */) {
      consume();
      addVNode(vnode_newFragment(parentVNode));
      stack.push(firstVNode, lastVNode, child, previousTextNode);
      firstVNode = lastVNode = null;
    } else if (peek() === 125 /* `}` */) {
      consume();
      const firstChild = firstVNode;
      previousTextNode = stack.pop();
      child = stack.pop();
      lastVNode = stack.pop();
      firstVNode = stack.pop();
      vnode_setFirstChild(lastVNode!, firstChild);
    } else {
      // must be alphanumeric
      let length = 0;
      if (combinedText === null) {
        combinedText = child ? child.nodeValue : null;
        textIdx = 0;
      }
      while (isLowercase(peek())) {
        length += consume() - 97; /* `a` */
        length *= 26;
      }
      length += consume() - 65; /* `A` */
      const text = combinedText === null ? '' : combinedText.substring(textIdx, textIdx + length);
      addVNode(
        (previousTextNode = vnode_newDeflatedText(
          parentVNode,
          previousTextNode,
          combinedText === null ? null : (child as Text),
          text
        ))
      );
      textIdx += length;
      // Text nodes get encoded as alphanumeric characters.
    }
  }
  return firstVNode!;
}

const isElement = (node: any): node is Element =>
  node && typeof node == 'object' && node.nodeType === /** Node.ELEMENT_NODE* */ 1;

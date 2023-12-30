import { SsrNode, type SsrNodeType } from './types';

/**
 * Array of numbers which describes virtual nodes in the tree.
 *
 * HTML can't account for:
 *
 * - Multiple text nodes in a row. (it trets it as a single text node)
 * - Empty text nodes. (it ignores them)
 * - And virtual nods such as `</>` or `<MyComponent/>`
 *
 * So we need to encode all of that information into the VNodeData.
 *
 * Encoding:
 *
 * - First position is special and encodes state information and stores VNodeDataFlag.
 * - Positive numbers are text node lengths. (0 is a special case for empty text node)
 * - Negative numbers are element counts.
 * - Number.MAX_SAFE_INTEGER is start of virtual node.
 * - Number.MIN_SAFE_INTEGER is end of virtual node.
 *
 * NOTE: This is how we store the information during the SSR streaming, once the SSR is complete
 * this data needs to be serialized into a string and stored in the DOM as a script tag which has
 * deferent serialization format.
 */
export type VNodeData = [VNodeDataFlag, ...number[]];

export const OPEN_FRAGMENT = Number.MAX_SAFE_INTEGER;
export const CLOSE_FRAGMENT = Number.MIN_SAFE_INTEGER;

/// Flags for VNodeData (Flags con be bitwise combined)
export const enum VNodeDataFlag {
  /// Initial state.
  NONE = 0,
  /// Indicates that multiple Text nodes are present and can't be derived from HTML.
  TEXT_DATA = 1,
  /// Indicates that the virtual nodes are present and can't be derived from HTML.
  VIRTUAL_NODE = 2,
  /// Indicates that serialized data is referencing this node and so we need to retrieve a reference to it.
  REFERENCE = 4,
}

export function vNodeData_incrementElementCount(vNodeData: VNodeData) {
  const length = vNodeData.length;
  const lastValue = length > 1 ? vNodeData[length - 1] : 0;
  if (lastValue >= 0 || lastValue === CLOSE_FRAGMENT) {
    // positive numbers are text node lengths.
    // So we just add -1 to indicate that we now have one element after text node
    vNodeData.push(-1);
  } else {
    // Negative numbers are element counts.
    // So we just subtract 1 from the last element count to say that we have one more element.
    vNodeData[length - 1] = lastValue - 1;
  }
}

export function vNodeData_addTextSize(vNodeData: VNodeData, size: number) {
  const length = vNodeData.length;
  if (length > 1 && vNodeData[length - 1] >= 0) {
    // previous item was text node, so we must update the flag
    vNodeData[0] |= VNodeDataFlag.TEXT_DATA;
  }
  vNodeData.push(size);
  if (size == 0) {
    // 0 is a special case for empty text node which is lost is serialization, must add flag.
    vNodeData[0] |= VNodeDataFlag.TEXT_DATA;
  }
}

export function vNodeData_openFragment(vNodeData: VNodeData) {
  vNodeData.push(OPEN_FRAGMENT);
  vNodeData[0] |= VNodeDataFlag.VIRTUAL_NODE;
}
export function vNodeData_closeFragment(vNodeData: VNodeData) {
  vNodeData.push(CLOSE_FRAGMENT);
}

export function vNodeData_createSsrNodeReference(
  vNodeData: VNodeData,
  depthFirstElementIdx: number
): SsrNode {
  vNodeData[0] |= VNodeDataFlag.REFERENCE;
  if (vNodeData.length == 1) {
    // Special case where we are referring to the Element directly. No need to descend into the tree.
    return new SsrNode(SsrNode.ELEMENT_NODE, String(depthFirstElementIdx));
  } else {
    const stack: (SsrNodeType | number)[] = [SsrNode.ELEMENT_NODE, -1];
    // We are referring to a virtual node. We need to descend into the tree to find the path to the node.
    for (let i = 1; i < vNodeData.length; i++) {
      const value = vNodeData[i];
      if (value === OPEN_FRAGMENT) {
        stack[stack.length - 1]++;
        stack.push(SsrNode.DOCUMENT_FRAGMENT_NODE, -1);
      } else if (value === CLOSE_FRAGMENT) {
        stack.pop(); // pop count
        stack.pop(); // pop nodeType
      } else if (value < 0) {
        // Negative numbers are element counts.
        const numberOfElements = 0 - value;
        // Add number of elements to skip
        stack[stack.length - 1] += numberOfElements;
      } else {
        // Positive numbers are text node lengths.
        // For each positive number we need to increment the count.
        stack[stack.length - 1]++;
      }
    }
    let refId = String(depthFirstElementIdx);
    for (let i = 1; i < stack.length; i += 2) {
      refId += encodeAsAlphanumeric(stack[i]);
    }
    const type = stack[stack.length - 2] as SsrNodeType;
    return new SsrNode(type, refId);
  }
}

/**
 * Encode number as alphanumeric string.
 *
 * The last character is uppercase, this allows us to skip any sort of separator.
 *
 * Example:
 *
 * - 0 -> A
 * - 1 -> B
 * - 10 -> K
 * - 25 -> Z
 * - 26 -> bA
 * - 100 -> dW
 * - 1000 -> bmM
 * - 10000 -> ouQ
 */
const ALPHANUMERIC: string[] = [];
export function encodeAsAlphanumeric(value: number): string {
  while (ALPHANUMERIC.length <= value) {
    let value = ALPHANUMERIC.length;
    let text = '';
    do {
      text =
        String.fromCharCode(
          (text.length === 0 ? 65 /* A */ : 97) /* a */ + (value % 26) /* A-Z */
        ) + text;
      value = Math.floor(value / 26 /* A-Z */);
    } while (value !== 0);
    ALPHANUMERIC.push(text);
  }
  return ALPHANUMERIC[value];
}

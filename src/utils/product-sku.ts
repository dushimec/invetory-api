export function nextProductSku(existingSkus: string[]) {
  const highestSequence = existingSkus.reduce((highest, sku) => {
    const match = /^SKU-(\d+)$/.exec(sku);
    if (!match) return highest;
    const sequence = BigInt(match[1]!);
    return sequence > highest ? sequence : highest;
  }, 0n);
  return `SKU-${(highestSequence + 1n).toString().padStart(6, '0')}`;
}

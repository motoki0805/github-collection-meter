/** SVG のテキストノードに埋める値をエスケープする。 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 座標を小数2桁に丸める。無駄な桁で差分が出るのを防ぐ。 */
export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

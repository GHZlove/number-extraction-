export const ELEMENTS = Object.freeze({
  fire: { label: '灼烧', color: '#ff9a58' },
  lightning: { label: '闪电', color: '#78eefa' },
  poison: { label: '毒雾', color: '#b7ef67' },
  frost: { label: '寒霜', color: '#7bd5ff' },
  wind: { label: '风压', color: '#a3ffbb' },
  space: { label: '折跃', color: '#c3a0ff' }
});

const enchantmentElements = { burn: 'fire', lightning: 'lightning', poison: 'poison', frost: 'frost' };

export function impactElement(impact) {
  const key = impact.element || enchantmentElements[impact.enchant] || enchantmentElements[impact.intrinsic];
  return ELEMENTS[key] || null;
}

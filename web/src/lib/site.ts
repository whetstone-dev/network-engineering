// Language-independent data
export const REPO_URL = 'https://github.com/whetstone-dev/network-engineering';
export const INSTALL_CMD = 'npx skills add whetstone-dev/network-engineering';
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

// Diagrams from examples/rendered (copied to public/examples). The order matches tour.examples in the dictionary.
export const EXAMPLE_FILES = [
  'pt-3vlan-roas-dhcp',
  'campus-ospf-nat',
  'campus-hsrp-stp-eigrp',
  'wan-2sites-ospf-serial',
  'asa-dmz',
  'vpn-ipsec-ospfv3',
  'troubleshooting-broken-lab',
  'diff-lab-vs-broken',
] as const;

// Color per section, like the VLANs in a diagram
export const SECTION_COLORS = {
  how: { vlan: 10, color: 'blue' },
  usage: { vlan: 20, color: 'teal' },
  features: { vlan: 30, color: 'violet' },
  toolkit: { vlan: 40, color: 'amber' },
  install: { vlan: 50, color: 'rose' },
} as const;

export function exampleUrl(file: string): string {
  return `${BASE_PATH}/examples/${file}.html`;
}

import React from 'react';
import * as Icons from '@deepseek-ai/dsh-client-ui-primitives';

// Share the host's actual icons; product branding remains in brand.jsx.
const icons = {
  overview: Icons.IconDataOutlineRegular, context: Icons.IconContextInjectionOutlineRegular,
  memory: Icons.IconDatabaseOutlineRegular, calls: Icons.IconFlatListOutlineRegular,
  events: Icons.IconClockOutlineRegular, evidence: Icons.IconChecklistOutlineRegular,
  refresh: Icons.IconRefreshOutlineRegular, search: Icons.IconSearchOutlineRegular,
  chevron: Icons.IconChevronRightOutlineRegular, down: Icons.IconChevronDownOutlineRegular,
  arrow: Icons.IconChevronRightOutlineRegular, close: Icons.IconCloseOutlineRegular,
  check: Icons.IconCheckOutlineRegular, spark: Icons.IconSparkleRegular,
  layers: Icons.IconWorkspaceTreeOutlineRegular, compress: Icons.IconCompactOutlineRegular,
  hub: Icons.IconBranchOutlineRegular, play: Icons.IconPlayOutlineRegular,
  stop: Icons.IconStopFillRegular, more: Icons.IconEllipsisOutlineRegular,
  settings: Icons.IconSettingsOutlineRegular, info: Icons.IconInfoOutlineRegular,
  external: Icons.IconRightUpOutlineRegular, globe: Icons.IconGlobeOutlineRegular,
  folder: Icons.IconFolderCloseRegular, lock: Icons.IconShieldOutlineRegular,
  bolt: Icons.IconEnhanceOutlineRegular, coin: Icons.IconDataOutlineRegular,
  input: Icons.IconDownloadOutlineRegular, output: Icons.IconRightUpOutlineRegular,
  cache: Icons.IconDatabaseOutlineRegular, omd: Icons.IconPersonalizationOutlineRegular,
  task: Icons.IconChecklistOutlineRegular, monitor: Icons.IconGaugeOutlineRegular,
  computer: Icons.IconBrowseOutlineRegular, clock: Icons.IconClockOutlineRegular,
  plugin: Icons.IconCordisPluginOutlineRegular,
};
export function Icon({ name, size = 16, className }) {
  const NativeIcon = icons[name] ?? Icons.IconInfoOutlineRegular;
  return <NativeIcon size={size} className={className}/>;
}

const choices = new Set(['armed', 'auto', 'open', 'closed']);
export const overviewChoice = value => choices.has(value) ? value : null;
export const isOverviewOpen = choice => choice === 'auto' || choice === 'open';

export function overviewTransition(previous, event) {
  let { choice, sidebarExpanded } = previous;
  switch (event.type) {
    case 'toggle':
      choice = isOverviewOpen(choice) ? 'closed' : 'open';
      break;
    case 'sidebar':
      if (event.expanded && !sidebarExpanded && choice === 'open') choice = 'closed';
      sidebarExpanded = event.expanded;
      break;
    case 'storage':
      choice = overviewChoice(event.value);
      break;
    case 'content':
      if (choice && choice !== 'armed') break;
      if (event.hasContent && (event.blank || event.recent || choice === 'armed')) choice = event.enabled ? 'auto' : 'closed';
      else if (!choice && (event.blank || event.ready && !event.hasContent)) choice = 'armed';
      break;
  }
  return { choice, open: isOverviewOpen(choice), sidebarExpanded };
}

import type { PartnerNavigationCommand } from '../domain/partnerNotifications';
import { partnerNavigationRef } from './partnerNavigationRef';

type RiderOperationsCommand = Extract<
  PartnerNavigationCommand,
  { workspace: 'RIDER'; tab: 'Operations' }
>;

function navigateRiderOperations(command: RiderOperationsCommand) {
  switch (command.screen) {
    case 'RiderOfferDetail':
      partnerNavigationRef.navigate('RiderTabs', { screen: 'Operations', params: { screen: 'RiderOfferDetail', params: command.params } });
      return;
    case 'RiderActiveJob':
      partnerNavigationRef.navigate('RiderTabs', { screen: 'Operations', params: { screen: 'RiderActiveJob', params: command.params } });
      return;
    case 'RiderPickup':
      partnerNavigationRef.navigate('RiderTabs', { screen: 'Operations', params: { screen: 'RiderPickup', params: command.params } });
      return;
    case 'RiderDelivery':
      partnerNavigationRef.navigate('RiderTabs', { screen: 'Operations', params: { screen: 'RiderDelivery', params: command.params } });
      return;
    case 'RiderReturn':
      partnerNavigationRef.navigate('RiderTabs', { screen: 'Operations', params: { screen: 'RiderReturn', params: command.params } });
      return;
    case 'RiderJobHistoryDetail':
      partnerNavigationRef.navigate('RiderTabs', { screen: 'Operations', params: { screen: 'RiderJobHistoryDetail', params: command.params } });
  }
}

export function navigatePartnerCommand(command: PartnerNavigationCommand) {
  if (!partnerNavigationRef.isReady()) return false;
  if (command.workspace === 'RIDER') {
    if (command.tab === 'Operations') navigateRiderOperations(command);
    else partnerNavigationRef.navigate('RiderTabs', { screen: command.tab });
    return true;
  }
  if (command.workspace === 'STORE') {
    partnerNavigationRef.navigate('StoreTabs', {
      screen: command.tab,
      params: { screen: 'OrderQueue', params: command.params },
    });
    return true;
  }
  partnerNavigationRef.navigate(command.screen);
  return true;
}

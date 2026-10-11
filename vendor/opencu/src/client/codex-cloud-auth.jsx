import React, { useEffect, useId, useRef, useState } from 'react';
import { CodexCuButton, CodexCuSplitButton, CodexCuSpinner, CodexCuMenuItem, CodexCuMenuRadioGroup, CodexCuMenuRadioItem } from './codex-cu-primitives.jsx';
import { CodexCuSettingsInput, CodexCuSettingsCheckbox } from './codex-cu-settings-primitives.jsx';
import { CodexCuDialog, CodexCuDialogTitle } from './codex-cu-dialog.jsx';
import { CodexCuIcon } from './codex-cu-icons.jsx';
import { CodexCloudBrowserPreview } from './codex-cloud-browser.jsx';
import { renderCodexCuSummarySection } from './codex-cu-summary.jsx';
import { CodexCuScope } from './codex-cu-scope.jsx';
import { useFormatCodexCuMessage } from './codex-cu-i18n.jsx';
import { formatCodexCuMessage } from './codex-cu-i18n.mjs';
import './codex-cu-tokens.css';
import './codex-cu-typography.css';
import './codex-cloud-auth.css';

// Unchanged packed-artifact references, complete source slices and REA Evidence:
// work/rea-reconstruction/cloud-auth/. Host gates and durable operations are props.
export const CODEX_CLOUD_AUTH_MESSAGES = /* SOURCE_MESSAGES_START */ {
  "chatgptConversations.cloudBrowser.auth.cancel": {
    "id": "chatgptConversations.cloudBrowser.auth.cancel",
    "defaultMessage": "Cancel",
    "description": "Secondary action that declines a pending ChatGPT cloud-browser website sign-in request and resumes the task without credentials"
  },
  "chatgptConversations.cloudBrowser.auth.skip": {
    "id": "chatgptConversations.cloudBrowser.auth.skip",
    "defaultMessage": "Skip",
    "description": "Button that declines a website sign-in request and allows the ChatGPT Work task to continue without credentials"
  },
  "chatgptConversations.cloudBrowser.auth.page.signIn": {
    "id": "chatgptConversations.cloudBrowser.auth.page.signIn",
    "defaultMessage": "Sign in",
    "description": "Primary button on the standalone mobile website sign-in page. Sends the entered credentials directly to the cloud browser to sign in to the displayed website, not to ChatGPT. Short imperative label; the secondary action skips or cancels sign-in."
  },
  "chatgptConversations.cloudBrowser.auth.page.changeMethod": {
    "id": "chatgptConversations.cloudBrowser.auth.page.changeMethod",
    "defaultMessage": "Change sign-in method",
    "description": "Returns from the standalone website credential form to the sign-in method choices on the same handoff, clearing entered credentials. Does not leave the handoff or return to the conversation."
  },
  "chatgptConversations.cloudBrowser.auth.page.hidePassword": {
    "id": "chatgptConversations.cloudBrowser.auth.page.hidePassword",
    "defaultMessage": "Hide password",
    "description": "Accessible label for the eye button in a standalone website sign-in password field when its characters are visible. Activating it masks the characters without changing the password or submitting the form."
  },
  "chatgptConversations.cloudBrowser.auth.page.showPassword": {
    "id": "chatgptConversations.cloudBrowser.auth.page.showPassword",
    "defaultMessage": "Show password",
    "description": "Accessible label for the eye button in a standalone website sign-in password field when its characters are masked. Activating it reveals the characters without changing the password or submitting the form."
  },
  "chatgptConversations.cloudBrowser.auth.page.error": {
    "id": "chatgptConversations.cloudBrowser.auth.page.error",
    "defaultMessage": "Something went wrong. Please try again.",
    "description": "Inline error shown when securely sending website sign-in details directly to the cloud browser fails"
  },
  "chatgptConversations.cloudBrowser.auth.credentialSecurityDisclosure": {
    "id": "chatgptConversations.cloudBrowser.auth.credentialSecurityDisclosure",
    "defaultMessage": "ChatGPT securely handles your credentials and keeps you signed in. Your password isn't stored. <link>Learn more</link>",
    "description": "Security disclosure above the actions in a ChatGPT cloud-browser website sign-in request; reassures users that ChatGPT handles credentials securely, keeps them signed in, and does not store their password; the link opens the related Help Center article"
  },
  "elicitation.page.tryAgain": {
    "id": "elicitation.page.tryAgain",
    "defaultMessage": "Try again",
    "description": "Reopen the still-pending approval form after its submission failed"
  },
  "elicitation.page.retry": {
    "id": "elicitation.page.retry",
    "defaultMessage": "Check again",
    "description": "Button to reconnect and look for the same pending request without starting a new agent turn"
  },
  "chatgptConversations.cloudBrowser.auth.page.title": {
    "id": "chatgptConversations.cloudBrowser.auth.page.title",
    "defaultMessage": "Sign in to {site}",
    "description": "Heading on the standalone cloud-browser credential page opened from a sign-in request. It tells the end user which website they are signing in to. Placeholder {site} is the credential provider's domain, such as resy.com, without a leading www.; it is not a translated brand name. Keep the heading concise; it may wrap on mobile."
  },
  "chatgptConversations.cloudBrowser.auth.page.signingIn": {
    "id": "chatgptConversations.cloudBrowser.auth.page.signingIn",
    "defaultMessage": "Signing in to {site}",
    "description": "Confirmation heading on the standalone browser sign-in page after the user's credentials were submitted and their response was sent to the task. Sign-in is underway, not guaranteed complete. {site} is the website's domain, such as example.com. Keep this mobile heading concise."
  },
  "chatgptConversations.cloudBrowser.auth.page.skipped": {
    "id": "chatgptConversations.cloudBrowser.auth.page.skipped",
    "defaultMessage": "Sign-in skipped",
    "description": "Confirmation heading on the standalone browser sign-in page after the user's skip or cancel response was sent to the task. No successful sign-in is implied. Short mobile heading."
  },
  "chatgptConversations.cloudBrowser.auth.page.returnToConversation": {
    "id": "chatgptConversations.cloudBrowser.auth.page.returnToConversation",
    "defaultMessage": "You can return to your conversation",
    "description": "Supporting text beneath the standalone browser sign-in confirmation. Tells the user to return manually to the originating conversation after their sign-in or skip response was sent. Does not claim website sign-in or task completion."
  },
  "browserAuth.savedCredentials.outcome.skipUnknownManual": {
    "id": "browserAuth.savedCredentials.outcome.skipUnknownManual",
    "defaultMessage": "Not now",
    "description": "Declines an uncertain manual website sign-in request and resumes the task without resending credentials."
  },
  "aeon.messaging.browserAuth.inspect": {
    "id": "aeon.messaging.browserAuth.inspect",
    "defaultMessage": "Check status",
    "description": "Reads the status of the existing sign-in request without sending credentials or a response again"
  },
  "aeon.messaging.browserAuth.resume": {
    "id": "aeon.messaging.browserAuth.resume",
    "defaultMessage": "Continue task",
    "description": "Acknowledges a recovered credential operation without submitting its credentials again"
  },
  "aeon.messaging.browserAuth.inspectError": {
    "id": "aeon.messaging.browserAuth.inspectError",
    "defaultMessage": "Couldn’t check this request",
    "description": "An error while reading the status of a Messaging sign-in request"
  },
  "aeon.messaging.browserAuth.entered": {
    "id": "aeon.messaging.browserAuth.entered",
    "defaultMessage": "Sign-in details entered",
    "description": "Persistent sign-in receipt confirming the browser entered the credentials, without claiming successful website authentication"
  },
  "aeon.messaging.browserAuth.closed": {
    "id": "aeon.messaging.browserAuth.closed",
    "defaultMessage": "Sign-in request closed",
    "description": "Persistent receipt for a website sign-in request that was answered or resolved elsewhere. Does not imply successful website authentication."
  },
  "aeon.messaging.browserAuth.open": {
    "id": "aeon.messaging.browserAuth.open",
    "defaultMessage": "Sign in to {site}",
    "description": "Pill opening a private website sign-in form. {site} is the website hostname, such as resy.com."
  },
  "aeon.messaging.browserAuth.ended": {
    "id": "aeon.messaging.browserAuth.ended",
    "defaultMessage": "This sign-in request is no longer available",
    "description": "A credential request expired or was resolved; its outcome is unknown"
  },
  "aeon.messaging.browserAuth.unconfirmed": {
    "id": "aeon.messaging.browserAuth.unconfirmed",
    "defaultMessage": "Couldn’t confirm the response. Check its status before continuing.",
    "description": "A private submission or response may have reached the server and must not be replayed"
  },
  "aeon.messaging.browserAuth.failed": {
    "id": "aeon.messaging.browserAuth.failed",
    "defaultMessage": "Couldn’t start secure sign-in. Request a new sign-in to try again.",
    "description": "A durable operation could not be started, so this form remains closed without replaying private values"
  },
  "aeon.messaging.browserAuth.loading": {
    "id": "aeon.messaging.browserAuth.loading",
    "defaultMessage": "Checking sign-in request…",
    "description": "Verifying that the credential request is still pending in its original task"
  },
  "aeon.messaging.browserAuth.unavailable": {
    "id": "aeon.messaging.browserAuth.unavailable",
    "defaultMessage": "This sign-in request is unavailable right now",
    "description": "The credential request could not be verified for this account"
  },
  "restricted.aeon.messaging.elicitation.fullParameters": {
    "id": "restricted.aeon.messaging.elicitation.fullParameters",
    "defaultMessage": "Full parameters",
    "description": "Expand the complete raw tool parameters alongside the formatted approval details"
  },
  "restricted.aeon.messaging.elicitation.allow": {
    "id": "restricted.aeon.messaging.elicitation.allow",
    "defaultMessage": "Allow",
    "description": "Allow the action described by this confirmation request"
  },
  "restricted.aeon.messaging.elicitation.cancel": {
    "id": "restricted.aeon.messaging.elicitation.cancel",
    "defaultMessage": "Cancel",
    "description": "Cancel this request without approving or denying the proposed action"
  },
  "restricted.aeon.messaging.elicitation.retryServices": {
    "id": "restricted.aeon.messaging.elicitation.retryServices",
    "defaultMessage": "Retry loading services",
    "description": "Retry loading verified catalog information for a requested app or plugin"
  },
  "restricted.aeon.messaging.elicitation.continueConnect": {
    "id": "restricted.aeon.messaging.elicitation.continueConnect",
    "defaultMessage": "Continue",
    "description": "Recheck all requested connections and finish the request"
  },
  "restricted.aeon.messaging.elicitation.connect": {
    "id": "restricted.aeon.messaging.elicitation.connect",
    "defaultMessage": "Connect",
    "description": "Start the shared consent flow for the requested services"
  },
  "restricted.aeon.messaging.elicitation.connectionFailed": {
    "id": "restricted.aeon.messaging.elicitation.connectionFailed",
    "defaultMessage": "Couldn’t verify all requested connections. Finish connecting the services, then continue",
    "description": "Connection verification failed; continuing checks all requested services again"
  },
  "restricted.aeon.messaging.location.failed": {
    "id": "restricted.aeon.messaging.location.failed",
    "defaultMessage": "Couldn’t get your location. Check your settings or try again",
    "description": "Device location is unavailable because of current settings or a failed location request"
  },
  "restricted.aeon.messaging.location.share": {
    "id": "restricted.aeon.messaging.location.share",
    "defaultMessage": "Share location",
    "description": "Share a fresh device location with this conversation"
  },
  "restricted.aeon.messaging.location.cancel": {
    "id": "restricted.aeon.messaging.location.cancel",
    "defaultMessage": "Not now",
    "description": "Cancel the location request without sharing a location"
  },
  "restricted.wallet.purchase.statusUnconfirmed": {
    "id": "restricted.wallet.purchase.statusUnconfirmed",
    "defaultMessage": "Couldn’t confirm this purchase’s status",
    "description": "A Wallet purchase response could not be confirmed"
  },
  "restricted.aeon.messaging.elicitation.unconfirmed": {
    "id": "restricted.aeon.messaging.elicitation.unconfirmed",
    "defaultMessage": "Couldn’t confirm this request’s status",
    "description": "A Messaging request could not be inspected or its response outcome is unknown"
  },
  "restricted.aeon.messaging.elicitation.check": {
    "id": "restricted.aeon.messaging.elicitation.check",
    "defaultMessage": "Check status",
    "description": "Inspect a Messaging request without submitting another response"
  },
  "restricted.aeon.messaging.elicitation.unsupported": {
    "id": "restricted.aeon.messaging.elicitation.unsupported",
    "defaultMessage": "This request isn’t supported in Messages yet",
    "description": "The server or this client cannot respond to this kind of Messaging request"
  },
  "restricted.wallet.purchase.declined": {
    "id": "restricted.wallet.purchase.declined",
    "defaultMessage": "Purchase declined",
    "description": "A Wallet purchase was declined on this device"
  },
  "restricted.aeon.messaging.elicitation.declined": {
    "id": "restricted.aeon.messaging.elicitation.declined",
    "defaultMessage": "Declined",
    "description": "A declined request acknowledged on this device"
  },
  "restricted.wallet.purchase.cancelled": {
    "id": "restricted.wallet.purchase.cancelled",
    "defaultMessage": "Purchase cancelled",
    "description": "A Wallet purchase was cancelled on this device"
  },
  "restricted.aeon.messaging.elicitation.cancelled": {
    "id": "restricted.aeon.messaging.elicitation.cancelled",
    "defaultMessage": "Cancelled",
    "description": "A cancelled request acknowledged on this device"
  },
  "restricted.wallet.enrollment.cardAdded": {
    "id": "restricted.wallet.enrollment.cardAdded",
    "defaultMessage": "Card added to Wallet",
    "description": "Enrollment finished with a saved card and the conversation acknowledged its registration ID"
  },
  "restricted.wallet.purchase.approved": {
    "id": "restricted.wallet.purchase.approved",
    "defaultMessage": "Purchase approved",
    "description": "A Wallet purchase approval was accepted; payment and order placement are not confirmed"
  },
  "restricted.aeon.messaging.elicitation.connected": {
    "id": "restricted.aeon.messaging.elicitation.connected",
    "defaultMessage": "Connected",
    "description": "All requested connections were verified and this device's acceptance was acknowledged"
  },
  "restricted.aeon.messaging.elicitation.alwaysAllowed": {
    "id": "restricted.aeon.messaging.elicitation.alwaysAllowed",
    "defaultMessage": "Always allowed",
    "description": "The runtime acknowledged allowing future matching tool requests"
  },
  "restricted.aeon.messaging.elicitation.sessionAllowed": {
    "id": "restricted.aeon.messaging.elicitation.sessionAllowed",
    "defaultMessage": "Allowed for this conversation",
    "description": "The runtime acknowledged allowing this tool for the conversation"
  },
  "restricted.aeon.messaging.elicitation.accepted": {
    "id": "restricted.aeon.messaging.elicitation.accepted",
    "defaultMessage": "Allowed",
    "description": "An accepted request acknowledged on this device"
  },
  "restricted.aeon.messaging.elicitation.sent": {
    "id": "restricted.aeon.messaging.elicitation.sent",
    "defaultMessage": "Response sent",
    "description": "The runtime acknowledged a response to this Messaging request"
  },
  "restricted.aeon.messaging.elicitation.closed": {
    "id": "restricted.aeon.messaging.elicitation.closed",
    "defaultMessage": "This request is no longer pending",
    "description": "The request was resolved elsewhere or expired; this does not imply it was approved"
  },
  "codex.localConversation.environmentSummary.copyBranchName": {
    "id": "codex.localConversation.environmentSummary.copyBranchName",
    "defaultMessage": "Copy branch name",
    "description": "Context menu action to copy the current branch name from the thread environment section"
  },
  "codex.localConversation.environmentSummary.title": {
    "id": "codex.localConversation.environmentSummary.title",
    "defaultMessage": "Environment",
    "description": "Title for the thread summary side panel environment and branch details section"
  },
  "composer.footer.branchSwitch.uncommittedSummaryPrefix": {
    "id": "composer.footer.branchSwitch.uncommittedSummaryPrefix",
    "defaultMessage": "Uncommitted: {fileCount, plural, one {# file} other {# files}}",
    "description": "Prefix shown under the active branch in the branch dropdown when there are uncommitted tracked changes"
  },
  "codex.dynamicIsle.activity.title": {
    "id": "codex.dynamicIsle.activity.title",
    "defaultMessage": "Activity",
    "description": "Heading for the summary card section showing activity in this conversation"
  },
  "codex.dynamicIsle.activity.subagents": {
    "id": "codex.dynamicIsle.activity.subagents",
    "defaultMessage": "Subagents",
    "description": "Activity row opening the subagents used by this conversation"
  },
  "codex.dynamicIsle.activity.subagentsUsedCount": {
    "id": "codex.dynamicIsle.activity.subagentsUsedCount",
    "defaultMessage": "{count, plural, one {# used} other {# used}}",
    "description": "Total number of subagents used by this conversation, shown next to the Subagents label in the Activity section, including active and finished subagents"
  },
  "codex.dynamicIsle.activity.browser": {
    "id": "codex.dynamicIsle.activity.browser",
    "defaultMessage": "Browser",
    "description": "Activity row opening the cloud browser and its recorded history for this conversation"
  },
  "codex.dynamicIsle.activity.browserTabCount": {
    "id": "codex.dynamicIsle.activity.browserTabCount",
    "defaultMessage": "{count, plural, one {# tab} other {# tabs}}",
    "description": "Number of distinct browser tabs used in this conversation, including tabs that may since have closed"
  },
  "chatgptConversations.summaryPanel.plans.retry": {
    "id": "chatgptConversations.summaryPanel.plans.retry",
    "defaultMessage": "Retry loading plans",
    "description": "Action to retry loading saved plan files in the conversation summary after a lookup fails"
  },
  "chatgptConversations.summaryPanel.subagents.title": {
    "id": "chatgptConversations.summaryPanel.subagents.title",
    "defaultMessage": "Subagents",
    "description": "Section title in the Work task details panel for delegated agents working on the task."
  },
  "chatgptConversations.summaryPanel.cloudBrowser.title": {
    "id": "chatgptConversations.summaryPanel.cloudBrowser.title",
    "defaultMessage": "Cloud browser",
    "description": "Section title in the Work task details panel for cloud-browser activity and screenshot replay"
  },
  "chatgptConversations.summaryPanel.progress.title": {
    "id": "chatgptConversations.summaryPanel.progress.title",
    "defaultMessage": "Progress",
    "description": "Section title in the Work task details panel for the task's current plan steps."
  },
  "chatgptConversations.summaryPanel.plan.title": {
    "id": "chatgptConversations.summaryPanel.plan.title",
    "defaultMessage": "Plan",
    "description": "Short heading above the saved automation checklist in the ChatGPT task summary panel. The checklist shows pending, in-progress, and completed steps."
  },
  "chatgptConversations.summaryPanel.progress.status.completed": {
    "id": "chatgptConversations.summaryPanel.progress.status.completed",
    "defaultMessage": "Done",
    "description": "Short status label for a completed plan step in the Work task details panel. Sibling statuses are In progress and Pending."
  },
  "chatgptConversations.summaryPanel.progress.status.inProgress": {
    "id": "chatgptConversations.summaryPanel.progress.status.inProgress",
    "defaultMessage": "In progress",
    "description": "Short status label for the active plan step in the Work task details panel. Sibling statuses are Done and Pending."
  },
  "chatgptConversations.summaryPanel.progress.status.pending": {
    "id": "chatgptConversations.summaryPanel.progress.status.pending",
    "defaultMessage": "Pending",
    "description": "Short status label for a plan step that has not started in the Work task details panel. Sibling statuses are Done and In progress."
  },
  "chatgptConversations.summaryPanel.outputs.none": {
    "id": "chatgptConversations.summaryPanel.outputs.none",
    "defaultMessage": "No outputs yet",
    "description": "Empty state in a read-only Work task Outputs section when no files or other results have been produced"
  },
  "chatgptConversations.summaryPanel.outputs.title": {
    "id": "chatgptConversations.summaryPanel.outputs.title",
    "defaultMessage": "Outputs",
    "description": "Section title in the Work task details panel for files and images generated by the task."
  },
  "chatgptConversations.summaryPanel.page.fallbackTitle": {
    "id": "chatgptConversations.summaryPanel.page.fallbackTitle",
    "defaultMessage": "Page",
    "description": "Fallback title for a Page in the Outputs section of the Work task details panel."
  },
  "chatgptConversations.summaryPanel.page.open.ariaLabel": {
    "id": "chatgptConversations.summaryPanel.page.open.ariaLabel",
    "defaultMessage": "Open {pageName}",
    "description": "Accessible label for opening a Page from the Outputs section of the Work task details panel. The pageName placeholder is the Page's display name."
  },
  "chatgptConversations.summaryPanel.site.fallbackTitle": {
    "id": "chatgptConversations.summaryPanel.site.fallbackTitle",
    "defaultMessage": "Site",
    "description": "Fallback title for a generated Site in the Outputs section of the Work task details panel."
  },
  "chatgptConversations.summaryPanel.site.open.ariaLabel": {
    "id": "chatgptConversations.summaryPanel.site.open.ariaLabel",
    "defaultMessage": "Preview {siteName}",
    "description": "Accessible label for opening a generated Site from the Outputs section of the Work task details panel. The siteName placeholder is the Site's display name."
  },
  "chatgptConversations.summaryPanel.files.previewBlocked.ariaLabel": {
    "id": "chatgptConversations.summaryPanel.files.previewBlocked.ariaLabel",
    "defaultMessage": "Opening {fileName} unavailable in lockdown mode",
    "description": "Accessible label for a disabled file row in the Work task details panel when lockdown mode blocks opening the file. The fileName placeholder is the displayed file name."
  },
  "chatgptConversations.summaryPanel.files.downloadBlocked.ariaLabel": {
    "id": "chatgptConversations.summaryPanel.files.downloadBlocked.ariaLabel",
    "defaultMessage": "Download {fileName} unavailable in lockdown mode",
    "description": "Accessible label for a disabled file download in the Work task details panel when lockdown mode blocks external file access. The fileName placeholder is the displayed file name."
  },
  "chatgptConversations.summaryPanel.files.openingPreview.ariaLabel": {
    "id": "chatgptConversations.summaryPanel.files.openingPreview.ariaLabel",
    "defaultMessage": "Opening {fileName}",
    "description": "Accessible label for a disabled file row in the Work task details panel while its file is opening. The fileName placeholder is the displayed name of the input or output file."
  },
  "chatgptConversations.summaryPanel.files.openPreview.ariaLabel": {
    "id": "chatgptConversations.summaryPanel.files.openPreview.ariaLabel",
    "defaultMessage": "Open {fileName}",
    "description": "Accessible label for a file row button in the Work task details panel that opens the file in a viewer or browser. The fileName placeholder is the displayed name of the input or output file."
  },
  "chatgptConversations.summaryPanel.files.downloading.ariaLabel": {
    "id": "chatgptConversations.summaryPanel.files.downloading.ariaLabel",
    "defaultMessage": "Downloading {fileName}",
    "description": "Accessible label for a disabled file row in the Work task details panel while its download is pending. The fileName placeholder is the displayed name of the input or output file."
  },
  "chatgptConversations.summaryPanel.files.download.ariaLabel": {
    "id": "chatgptConversations.summaryPanel.files.download.ariaLabel",
    "defaultMessage": "Download {fileName}",
    "description": "Accessible label for a file row button in the Work task details panel. The fileName placeholder is the displayed name of the input or output file that will be downloaded."
  },
  "chatgptConversations.summaryPanel.files.previewFailed.toast": {
    "id": "chatgptConversations.summaryPanel.files.previewFailed.toast",
    "defaultMessage": "Failed to open {fileName}",
    "description": "Error toast shown when a file in the Work task details panel cannot be opened. The fileName placeholder is the displayed file name."
  },
  "chatgptConversations.summaryPanel.files.downloadFailed.toast": {
    "id": "chatgptConversations.summaryPanel.files.downloadFailed.toast",
    "defaultMessage": "Failed to download {fileName}",
    "description": "Error toast shown when a file in the Work task details panel cannot be downloaded. The fileName placeholder is the displayed file name."
  },
  "chatgptConversations.subagents.nameFallback": {
    "id": "chatgptConversations.subagents.nameFallback",
    "defaultMessage": "Subagent",
    "description": "Short fallback name shown in Work subagent activity chips and side panel rows when the backend did not provide a display name."
  },
  "chatgptConversations.summaryPanel.subagents.status.waiting": {
    "id": "chatgptConversations.summaryPanel.subagents.status.waiting",
    "defaultMessage": "Waiting",
    "description": "Short status label for a delegated agent waiting to start in the Work task details panel. Sibling statuses are Working, Done, and Failed."
  },
  "chatgptConversations.summaryPanel.subagents.status.working": {
    "id": "chatgptConversations.summaryPanel.subagents.status.working",
    "defaultMessage": "Working",
    "description": "Short status label for a delegated agent currently working in the Work task details panel. Sibling statuses are Waiting, Done, and Failed."
  },
  "chatgptConversations.summaryPanel.subagents.status.done": {
    "id": "chatgptConversations.summaryPanel.subagents.status.done",
    "defaultMessage": "Done",
    "description": "Short status label for a completed delegated agent in the Work task details panel. Sibling statuses are Waiting, Working, and Failed."
  },
  "chatgptConversations.summaryPanel.subagents.status.failed": {
    "id": "chatgptConversations.summaryPanel.subagents.status.failed",
    "defaultMessage": "Failed",
    "description": "Short status label for a failed delegated agent in the Work task details panel. Sibling statuses are Waiting, Working, and Done."
  },
  "elicitation.page.connecting": {
    "id": "elicitation.page.connecting",
    "defaultMessage": "Connecting to your request…",
    "description": "Status while the standalone request page reconnects to the task that needs user input"
  },
  "elicitation.page.submissionFailed": {
    "id": "elicitation.page.submissionFailed",
    "defaultMessage": "Couldn't submit your response",
    "description": "Heading when submitting a standalone approval response failed"
  },
  "elicitation.page.responseSubmitted": {
    "id": "elicitation.page.responseSubmitted",
    "defaultMessage": "Response submitted",
    "description": "Heading after the user submits an approval response, without asserting that the action completed"
  },
  "elicitation.page.responseDeclined": {
    "id": "elicitation.page.responseDeclined",
    "defaultMessage": "Request declined",
    "description": "Heading after the user submits a decline response"
  },
  "elicitation.page.responseCanceled": {
    "id": "elicitation.page.responseCanceled",
    "defaultMessage": "Request canceled",
    "description": "Heading after the user submits a cancel response, not merely after a modal is dismissed"
  },
  "elicitation.page.checkConversationResult": {
    "id": "elicitation.page.checkConversationResult",
    "defaultMessage": "You can close this page and check the result in your conversation",
    "description": "Guidance to check the conversation after submitting or failing to submit an approval response"
  },
  "elicitation.page.unavailable": {
    "id": "elicitation.page.unavailable",
    "defaultMessage": "This request is no longer available. It may already be answered or cancelled.",
    "description": "Message when the specific linked request cannot be shown; does not claim the request or task completed"
  },
  "elicitation.page.title": {
    "id": "elicitation.page.title",
    "defaultMessage": "Continue your request",
    "description": "Heading on a focused page opened from a messaging channel to answer an existing agent request"
  },
  "browserAuth.signInTitle": {
    "id": "browserAuth.signInTitle",
    "defaultMessage": "Sign in to {site}",
    "description": "Website sign-in heading. Site is the credential domain, such as resy.com, not a translated brand name."
  },
  "browserAuth.backToMethods": {
    "id": "browserAuth.backToMethods",
    "defaultMessage": "Back to sign-in methods",
    "description": "Returns to website sign-in method selection and clears entered credentials"
  },
  "browserAuth.skipRequest": {
    "id": "browserAuth.skipRequest",
    "defaultMessage": "Not now",
    "description": "Declines the website sign-in request without submitting credentials"
  },
  "browserAuth.otherSignInOptions": {
    "id": "browserAuth.otherSignInOptions",
    "defaultMessage": "Other sign-in options",
    "description": "Opens the split button menu of saved accounts and alternate website sign-in methods"
  },
  "browserAuth.confirmation.enterManually": {
    "id": "browserAuth.confirmation.enterManually",
    "defaultMessage": "Use different account",
    "description": "Declines using the selected saved credential and asks the owner for manual entry"
  },
  "browserAuth.confirmation.signInOnWebPage": {
    "id": "browserAuth.confirmation.signInOnWebPage",
    "defaultMessage": "Take over to sign in",
    "description": "Opens the live browser so the user can sign in directly on the website"
  },
  "browserAuth.confirmation.saveTitle": {
    "id": "browserAuth.confirmation.saveTitle",
    "defaultMessage": "Save this login?",
    "description": "Asks for explicit consent to save a login; this component does not itself persist credentials"
  },
  "browserAuth.confirmation.authorizeTitle": {
    "id": "browserAuth.confirmation.authorizeTitle",
    "defaultMessage": "{provider} access requested",
    "description": "Title of the named password manager's requested credential access"
  },
  "browserAuth.confirmation.useTitle": {
    "id": "browserAuth.confirmation.useTitle",
    "defaultMessage": "Use this saved account?",
    "description": "Asks the user to confirm using the selected saved account for a website"
  },
  "browserAuth.confirmation.pending": {
    "id": "browserAuth.confirmation.pending",
    "defaultMessage": "Waiting for the password manager…",
    "description": "Pending status after the user explicitly confirms a credential operation"
  },
  "browserAuth.confirmation.saveDescription": {
    "id": "browserAuth.confirmation.saveDescription",
    "defaultMessage": "Save this {site} login in {provider} for future sign-ins",
    "description": "Explains the website and storage provider for an explicit credential-save confirmation"
  },
  "browserAuth.confirmation.authorizeDescription": {
    "id": "browserAuth.confirmation.authorizeDescription",
    "defaultMessage": "Allow OpenAI to fill your {site} login with {provider}",
    "description": "Explains the requested access for a named site's credential in a named manager; confirmation is an explicit callback"
  },
  "browserAuth.confirmation.useDescriptionWithHelp": {
    "id": "browserAuth.confirmation.useDescriptionWithHelp",
    "defaultMessage": "We found a matching login in {provider}. <link>Learn more</link>",
    "description": "Explains a saved-login match without automatically using it, with a link to learn about private credential handling"
  },
  "browserAuth.confirmation.decline": {
    "id": "browserAuth.confirmation.decline",
    "defaultMessage": "Not now",
    "description": "Dismisses the website sign-in request without using a saved account, or declines saving or granting access to a login. Unlike Use different account, this does not switch to manual sign-in."
  },
  "browserAuth.confirmation.save": {
    "id": "browserAuth.confirmation.save",
    "defaultMessage": "Save login",
    "description": "Explicit confirmation to save the displayed login in the named provider"
  },
  "browserAuth.confirmation.authorize": {
    "id": "browserAuth.confirmation.authorize",
    "defaultMessage": "Authorize",
    "description": "Explicitly requests the owner to authorize access; no biometric or provider method is implied"
  },
  "browserAuth.preparing": {
    "id": "browserAuth.preparing",
    "defaultMessage": "Preparing…",
    "description": "Button status while preparing a private sign-in submission"
  },
  "browserAuth.sending": {
    "id": "browserAuth.sending",
    "defaultMessage": "Sending…",
    "description": "Button status while sending private sign-in details to the website"
  },
  "browserAuth.confirmation.use": {
    "id": "browserAuth.confirmation.use",
    "defaultMessage": "Use saved account",
    "description": "Explicitly confirms using the displayed account after it has been selected"
  },
  "browserAuth.confirmation.redactedPassword": {
    "id": "browserAuth.confirmation.redactedPassword",
    "defaultMessage": "Password hidden",
    "description": "Accessible label for a fixed placeholder representing a saved password; the password is never loaded"
  },
  "browserAuth.confirmation.disclosure": {
    "id": "browserAuth.confirmation.disclosure",
    "defaultMessage": "This login is shared with the remote browser session",
    "description": "Disclosure in the explicit remote browser credential-access approval"
  },
  "browserAuth.qrCode.waiting": {
    "id": "browserAuth.qrCode.waiting",
    "defaultMessage": "Waiting for the sign-in QR code…",
    "description": "Shown while waiting for a website sign-in QR code to become available for scanning in the cloud-browser sign-in card."
  },
  "browserAuth.qrCode.label": {
    "id": "browserAuth.qrCode.label",
    "defaultMessage": "QR code for secure browser sign-in",
    "description": "Accessible image label for the QR code users scan on their phone to sign in to the website in the cloud browser."
  },
  "browserAuth.qrCode.unavailable": {
    "id": "browserAuth.qrCode.unavailable",
    "defaultMessage": "This QR code couldn’t be displayed. You can sign in on the web page instead.",
    "description": "Shown when the cloud-browser sign-in QR payload cannot be displayed; the user can open the website directly through the sign-in card."
  },
  "browserAuth.qrCode.requiresApp": {
    "id": "browserAuth.qrCode.requiresApp",
    "defaultMessage": "You may have to use an app to scan this QR code",
    "description": "Additional instruction for website sign-in QR codes that require a service-specific mobile app rather than the phone camera."
  },
  "browserAuth.continueOnWebsite": {
    "id": "browserAuth.continueOnWebsite",
    "defaultMessage": "Continue signing in on the website",
    "description": "The website sign-in request has no fields or methods that can be shown here, so the user must continue directly on the website"
  },
  "browserAuth.recoveryTakeOver": {
    "id": "browserAuth.recoveryTakeOver",
    "defaultMessage": "Take over",
    "description": "Opens the live browser so the user can sign in directly on the website"
  },
  "browserAuth.verificationCodeHeading": {
    "id": "browserAuth.verificationCodeHeading",
    "defaultMessage": "Enter verification code",
    "description": "Heading requesting a one-time verification code for a website"
  },
  "browserAuth.qrCode.instructions": {
    "id": "browserAuth.qrCode.instructions",
    "defaultMessage": "Scan the QR code with your phone to continue signing in",
    "description": "Instruction in the cloud-browser website sign-in card telling the user to scan the displayed QR code with their phone."
  },
  "browserAuth.descriptionWithHelp": {
    "id": "browserAuth.descriptionWithHelp",
    "defaultMessage": "Enter your login details to continue. <link>Learn more</link>",
    "description": "Instructions for the private website sign-in form with a link to learn about credential handling"
  },
  "browserAuth.continueWithVerificationCode": {
    "id": "browserAuth.continueWithVerificationCode",
    "defaultMessage": "Continue",
    "description": "Submits the private one-time verification code to the website"
  },
  "browserAuth.qrCode.done": {
    "id": "browserAuth.qrCode.done",
    "defaultMessage": "Done",
    "description": "Confirms the user finished scanning a website sign-in QR code and resumes the cloud-browser task."
  },
  "browserAuth.submit": {
    "id": "browserAuth.submit",
    "defaultMessage": "Sign in",
    "description": "Explicitly sends private website sign-in fields to the browser"
  },
  "browserAuth.hidePassword": {
    "id": "browserAuth.hidePassword",
    "defaultMessage": "Hide password",
    "description": "Masks the private password field"
  },
  "browserAuth.showPassword": {
    "id": "browserAuth.showPassword",
    "defaultMessage": "Show password",
    "description": "Reveals the private password field"
  },
  "browserAuth.remember": {
    "id": "browserAuth.remember",
    "defaultMessage": "Save to Passwords",
    "description": "Unchecked opt-in to save the entered login in Passwords after submitting it to this website"
  },
  "browserAuth.loginPicker.entryAndProvider": {
    "id": "browserAuth.loginPicker.entryAndProvider",
    "defaultMessage": "Entry {reference} · {provider}",
    "description": "Entry reference and password manager name distinguishing saved logins with the same account label, which may be a full username or email address"
  },
  "browserAuth.loadingSignInOptions": {
    "id": "browserAuth.loadingSignInOptions",
    "defaultMessage": "Loading sign-in options",
    "description": "Screen-reader status while available sign-in methods and saved accounts load; the visible dialog shows only a spinner"
  },
  "browserAuth.moreLogins": {
    "id": "browserAuth.moreLogins",
    "defaultMessage": "More saved logins",
    "description": "Loads the next page of saved account choices"
  },
  "browserAuth.recoveryUnavailable": {
    "id": "browserAuth.recoveryUnavailable",
    "defaultMessage": "We couldn’t restore this sign-in request",
    "description": "Explanation when a website sign-in request cannot be safely restored. The user can skip the request or sign in directly on the webpage when available."
  },
  "browserAuth.selectionExpired": {
    "id": "browserAuth.selectionExpired",
    "defaultMessage": "This saved login choice expired. Choose it again to continue.",
    "description": "The short-lived authorization for the selected saved login expired before confirmation"
  },
  "browserAuth.lookupFailed": {
    "id": "browserAuth.lookupFailed",
    "defaultMessage": "Couldn’t load saved logins",
    "description": "Saved account lookup failed; manual entry remains available"
  },
  "browserAuth.retryLookup": {
    "id": "browserAuth.retryLookup",
    "defaultMessage": "Try again",
    "description": "Retries loading saved account metadata without submitting credentials"
  },
  "browserAuth.backToSignIn": {
    "id": "browserAuth.backToSignIn",
    "defaultMessage": "Back to sign in",
    "description": "Returns from signing in on the website to the credential form without ending the request"
  },
  "chatgptConversations.cloudBrowser.auth.waiting": {
    "id": "chatgptConversations.cloudBrowser.auth.waiting",
    "defaultMessage": "Let me know when you're done signing in",
    "description": "Heading shown while the user signs in directly inside the live cloud browser and the ChatGPT task is paused"
  },
  "browserAuth.manualSignIn.notNow": {
    "id": "browserAuth.manualSignIn.notNow",
    "defaultMessage": "Not now",
    "description": "Button that declines a website sign-in request and allows the ChatGPT Work task to continue without credentials"
  },
  "chatgptConversations.cloudBrowser.auth.done": {
    "id": "chatgptConversations.cloudBrowser.auth.done",
    "defaultMessage": "Done",
    "description": "Button confirming that the user has finished signing in directly inside the live cloud browser"
  },
  "browserAuth.receipt.unknown": {
    "id": "browserAuth.receipt.unknown",
    "defaultMessage": "Something went wrong, please take over to sign in",
    "description": "An uncertain credential submission requires the user to take over signing in without replaying the submission"
  },
  "browserAuth.receipt.notSubmittedSaved": {
    "id": "browserAuth.receipt.notSubmittedSaved",
    "defaultMessage": "Credential Saved",
    "description": "The browser rejected the credential submission but the user’s requested save succeeded"
  },
  "browserAuth.receipt.notSubmitted": {
    "id": "browserAuth.receipt.notSubmitted",
    "defaultMessage": "The browser couldn’t submit your details. Nothing was saved.",
    "description": "A definitively rejected credential submission with no save"
  },
  "browserAuth.receipt.notSubmittedSaveUnknown": {
    "id": "browserAuth.receipt.notSubmittedSaveUnknown",
    "defaultMessage": "The browser couldn’t submit your details. We couldn’t confirm whether the login was saved.",
    "description": "The private fill was rejected but its optional save remains uncertain; status must be checked without replaying the fill"
  },
  "browserAuth.receipt.enteredSaved": {
    "id": "browserAuth.receipt.enteredSaved",
    "defaultMessage": "Sign-in details entered. Login saved in Passwords.",
    "description": "Receipt in the website sign-in prompt after the browser completed entering details and the requested action, and the optional login save succeeded. It does not confirm network delivery or successful website authentication."
  },
  "browserAuth.receipt.entered": {
    "id": "browserAuth.receipt.entered",
    "defaultMessage": "Sign-in details entered",
    "description": "Receipt in the website sign-in prompt after the browser completed entering details and the requested action. It does not confirm network delivery or successful website authentication, and no new login save was requested."
  },
  "browserAuth.receipt.enteredSaveFailed": {
    "id": "browserAuth.receipt.enteredSaveFailed",
    "defaultMessage": "Sign-in details entered, but this login wasn’t saved. You can save it next time you sign in.",
    "description": "Receipt in the website sign-in prompt after the browser completed entering details and the requested action, but the optional login save failed. It does not confirm network delivery or successful website authentication. The user should not repeat this sign-in request to retry saving."
  },
  "browserAuth.receipt.enteredSaveUnknown": {
    "id": "browserAuth.receipt.enteredSaveUnknown",
    "defaultMessage": "Sign-in details entered. We couldn’t confirm whether the login was saved.",
    "description": "Receipt in the website sign-in prompt after the browser completed entering details and the requested action, but the optional login save result is uncertain. It does not confirm network delivery or successful website authentication. The user may check status without repeating the sign-in request."
  },
  "browserAuth.receipt.done": {
    "id": "browserAuth.receipt.done",
    "defaultMessage": "Done",
    "description": "Dismisses a credential outcome without replaying any operation"
  },
  "browserAuth.receipt.check": {
    "id": "browserAuth.receipt.check",
    "defaultMessage": "Check status",
    "description": "Reads the outcome without resending credentials"
  },
  "browserAuth.receipt.inspect": {
    "id": "browserAuth.receipt.inspect",
    "defaultMessage": "Take over",
    "description": "Opens the browser to inspect an uncertain submission without sending it again"
  }
} /* SOURCE_MESSAGES_END */;
const p = (...values) => values.flat(Infinity).filter(Boolean).join(' ').split(/\s+/).filter(Boolean).map(value => `cua-${value}`).join(' ');
const join = (...values) => values.filter(Boolean).join(' ');
const HELP_URL = 'https://help.openai.com/articles/20001280';
const methodAssets = [['google', 'shared:sp'], ['microsoft', 'shared:op'], ['facebook', 'shared:lp'], ['apple', 'shared:Mht']];

export function getCodexCloudAuthOptionIcon(option, fields) {
  const optionFields = fields.filter(field => option.fieldIds.includes(field.id));
  const provider = methodAssets.find(([name]) => option.label.toLowerCase().includes(name));
  const icon = provider?.[1] ?? (optionFields.some(field => field.type === 'email') ? 'shared:Sft' : optionFields.some(field => field.type === 'tel') ? 'shared:jlt' : undefined);
  return icon == null ? null : <CodexCuIcon name={icon} className={p('shrink-0')} style={icon === 'shared:lp' ? { color: '#0866FF' } : undefined} />;
}

function message(formatMessage, id, values = {}) {
  const descriptor = CODEX_CLOUD_AUTH_MESSAGES[id];
  if (!descriptor) throw new Error(`Missing original Cloud Auth message: ${id}`);
  const formatted = (formatMessage ?? formatCodexCuMessage)(descriptor, values);
  if (typeof formatted !== 'string') return formatted;
  const parts = formatted.split(/<link>(.*?)<\/link>/g);
  if (parts.length === 1) return formatted;
  // The three source rich messages contain only link and simple scalar values.
  const interpolate = text => text.replace(/\{([A-Za-z_][A-Za-z0-9_.-]*)\}/g, (original, key) =>
    ['string', 'number', 'boolean'].includes(typeof values[key]) ? String(values[key]) : original);
  return parts.map((part, index) => index % 2 ? values.link?.(interpolate(part)) ?? interpolate(part) : interpolate(part));
}

function useAuthFormat(formatMessage, locale) {
  const inherited = useFormatCodexCuMessage();
  return formatMessage ?? (locale === undefined ? inherited : (descriptor, values) => formatCodexCuMessage(descriptor, values, locale));
}

function helpLink(onOpenHelp, openHelpExternally) {
  return children => <a className={p('cursor-interaction text-info')} href={HELP_URL}
    onClick={event => { if (onOpenHelp) { event.preventDefault(); onOpenHelp({ href: HELP_URL, initiator: 'open_in_browser_bridge', openTarget: openHelpExternally ? 'external-browser' : undefined, event }); } }}>
    {children}
  </a>;
}

function Scope({ theme, windowType, fontPreset, opaque, className, children, ...props }) {
  return <CodexCuScope {...props} theme={theme} referenceWindowType={windowType} typographyPreset={fontPreset}
    {...(opaque == null ? {} : { 'data-codex-cu-opaque': String(opaque) })} className={className}>{children}</CodexCuScope>;
}

/** Ljs's image loading is controlled by a caller-supplied original favicon URL. */
export function CodexCloudAuthSiteIcon({ src, loaded = false, onLoad, loadRemote = true, className, globeIcon }) {
  return <span className={p('_Favicon_fkymq_2 inline-block shrink-0', className)}>
    {!loaded || !loadRemote || !src ? <span className={p('absolute inset-0 flex items-center justify-center')}>
      {globeIcon ?? <CodexCuIcon name="shared:Dtt" />}
    </span> : null}
    {loadRemote && src ? <img alt="" className={p('absolute inset-0 h-full w-full rounded-2xs object-contain', loaded ? 'opacity-100' : 'opacity-0')}
      decoding="async" draggable={false} referrerPolicy="no-referrer" src={src} onLoad={onLoad} /> : null}
  </span>;
}

/** m; displaySiteName is the source tldts allowPrivateDomains result (or its null fallback). */
export function CodexCloudAuthHeader({ browserAuth, displaySiteName, status = 'pending', loadRemote = true,
  siteIcon, favicon, chatGptIcon, formatMessage, locale }) {
  formatMessage = useAuthFormat(formatMessage, locale);
  const url = new URL(browserAuth.origin), origin = url.origin;
  const site = displaySiteName;
  const start = origin.lastIndexOf(site);
  const heading = status === 'pending' ? 'chatgptConversations.cloudBrowser.auth.page.title'
    : status === 'accepted' ? 'chatgptConversations.cloudBrowser.auth.page.signingIn'
      : 'chatgptConversations.cloudBrowser.auth.page.skipped';
  return <div className={p('flex min-w-0 flex-col items-center text-center', status === 'pending' ? 'gap-4' : 'gap-6')}>
    <div aria-hidden="true" className={p('flex items-center gap-3')}>
      <span className={p('flex size-14 shrink-0 items-center justify-center rounded-xl border border-default')}>
        {chatGptIcon ?? <CodexCuIcon name="shared:S5" className={p('size-12')} />}
      </span>
      <span className={p('flex items-center gap-1')}>
        <span className={p('size-1.5 rounded-full bg-border')} />
        {status === 'pending' ? <span className={p('size-1.5 rounded-full bg-border')} /> : <CodexCuIcon name="shared:Z9" className={p('text-success')} />}
        <span className={p('size-1.5 rounded-full bg-border')} />
      </span>
      <span className={p('flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-default')}>
        {siteIcon ?? <CodexCloudAuthSiteIcon {...favicon} loadRemote={loadRemote} className="size-12" />}
      </span>
    </div>
    <div className={p('flex w-full min-w-0 flex-col gap-2')}>
      <h1 className={p('w-full min-w-0 text-heading-app leading-tight font-normal break-words text-default select-none')}>
        {message(formatMessage, heading, { site })}
      </h1>
      {status === 'pending' ? null : <p className={p('text-sm text-secondary')}>
        {message(formatMessage, 'chatgptConversations.cloudBrowser.auth.page.returnToConversation')}
      </p>}
    </div>
    {status === 'pending' ? <span className={p('flex min-w-0 items-center gap-1 text-sm text-secondary')}>
      {url.protocol === 'https:' ? <CodexCuIcon name="shared:gnt" /> : null}
      <span className={p('min-w-0 break-all')} dir="ltr">
        {origin.slice(0, start)}<span className={p('text-default')}>{site}</span>{origin.slice(start + site.length)}
      </span>
    </span> : null}
  </div>;
}

/** Me; entered fields stay in this form and are only passed to the supplied intent callback. */
export function CodexCloudAuthStandaloneForm({ browserAuth, state = 'ready', disabled = false,
  selectedOptionId, onSelectOption, onChangeMethod, onSubmit, onSkip, onClearFields, onFieldChange,
  fieldValues, passwordIcon = <CodexCuIcon name="shared:qet" />, formatMessage, locale, onOpenHelp, ...headerProps }) {
  formatMessage = useAuthFormat(formatMessage, locale);
  const id = useId(), form = useRef(null), [visible, setVisible] = useState(new Set());
  const [hasInput, setHasInput] = useState(false), [invalid, setInvalid] = useState(false);
  const selected = browserAuth.options?.find(option => option.id === selectedOptionId);
  const fields = browserAuth.options == null ? browserAuth.fields : browserAuth.fields.filter(field => selected?.fieldIds.includes(field.id));
  const submitting = state === 'submitting';
  const clear = () => {
    form.current?.querySelectorAll('input').forEach(input => { input.value = ''; });
    setHasInput(false); setInvalid(false); setVisible(new Set()); onClearFields?.();
  };
  const submit = async (event, option = selected) => {
    event.preventDefault();
    if (submitting || !onSubmit || disabled) return;
    if (browserAuth.options != null && option == null) { setInvalid(true); return; }
    const allowed = option == null ? null : new Set(option.fieldIds), values = {};
    for (const field of browserAuth.fields) {
      if (allowed != null && !allowed.has(field.id)) continue;
      const input = form.current?.elements.namedItem(field.id);
      if (!input || !input.reportValidity()) { setInvalid(true); return; }
      if (input.value.length > 0) values[field.id] = { value: input.value };
    }
    await onSubmit(values, option?.id, clear);
  };
  return <div className={p('flex flex-1 flex-col text-default focus:outline-none')}>
    <form ref={form} className={p('flex min-w-0 flex-1 flex-col justify-evenly gap-6')}
      data-dd-privacy="mask" onSubmit={submit}>
      <CodexCloudAuthHeader {...headerProps} browserAuth={browserAuth} loadRemote={!disabled} formatMessage={formatMessage} />
      <div className={p('flex flex-col gap-6')}>
        {selected == null ? null : <CodexCuButton color="ghostSecondary" disabled={submitting} size="dialogGhost"
          onClick={() => { clear(); onChangeMethod?.(); }}>{message(formatMessage, 'chatgptConversations.cloudBrowser.auth.page.changeMethod')}</CodexCuButton>}
        {browserAuth.options != null && selected == null ? <div className={p('flex flex-col')}>
          {browserAuth.options.map(option => <button key={option.id} type="button" disabled={disabled || submitting}
            className={p('flex w-full cursor-interaction items-center border-b border-default py-2 text-start text-base text-default last:border-b-0 disabled:cursor-not-allowed disabled:opacity-40')}
            onClick={event => { clear(); option.fieldIds.length === 0 ? submit(event, option) : onSelectOption?.(option.id); }}>{option.label}</button>)}
        </div> : null}
        <div className={p('flex flex-col gap-3')}>
          {fields.map(field => <div key={field.id} className={p('flex min-w-0 flex-col gap-1')}>
            <label className={p('sr-only')} htmlFor={`${id}-${field.id}`}>{field.label}</label>
            <CodexCuSettingsInput id={`${id}-${field.id}`} variant="auth" placeholder={field.label}
              autoComplete={field.autocomplete ?? undefined} data-1p-ignore="true" data-dd-privacy="mask" data-lpignore="true"
              disabled={disabled || submitting} name={field.id} required={field.required}
              value={fieldValues?.[field.id]} type={field.type === 'password' && visible.has(field.id) ? 'text' : field.type}
              trailingControl={field.type === 'password' ? <CodexCuButton
                aria-label={message(formatMessage, `chatgptConversations.cloudBrowser.auth.page.${visible.has(field.id) ? 'hidePassword' : 'showPassword'}`)}
                aria-controls={`${id}-${field.id}`} color="ghost" disabled={disabled || submitting} size="inputIcon"
                onClick={() => setVisible(current => { const next = new Set(current); next.has(field.id) ? next.delete(field.id) : next.add(field.id); return next; })}>
                {passwordIcon}
              </CodexCuButton> : undefined}
              onChange={event => { onFieldChange?.(field.id, event.target.value); const inputs = [...(form.current?.querySelectorAll('input') ?? [])];
                setHasInput(inputs.some(input => input.value.length > 0) && inputs.every(input => !input.required || input.value.length > 0)); }} />
          </div>)}
        </div>
        {state === 'error' || invalid ? <span className={p('text-sm text-danger')} role="alert">{message(formatMessage, 'chatgptConversations.cloudBrowser.auth.page.error')}</span> : null}
        <span className={p('text-sm text-secondary')}>{message(formatMessage, 'chatgptConversations.cloudBrowser.auth.credentialSecurityDisclosure', { link: helpLink(onOpenHelp) })}</span>
      </div>
      <div className={p('sticky bottom-0 flex shrink-0 flex-col gap-3 bg-surface py-4')}>
        <CodexCuButton disabled={disabled || !hasInput} loading={submitting} size="auth" type="submit">{message(formatMessage, 'chatgptConversations.cloudBrowser.auth.page.signIn')}</CodexCuButton>
        <CodexCuButton color="outlineGhost" disabled={submitting} size="auth" onClick={() => { clear(); onSkip?.(); }}>
          {message(formatMessage, browserAuth.options != null || hasInput || submitting ? 'chatgptConversations.cloudBrowser.auth.cancel' : 'chatgptConversations.cloudBrowser.auth.skip')}
        </CodexCuButton>
      </div>
    </form>
  </div>;
}

/** status-e33879cb7961:l and its q1n default layout. */
export function CodexCloudAuthStatus({ status, formatMessage, locale, children, scopeProps }) {
  formatMessage = useAuthFormat(formatMessage, locale);
  if (status === 'connecting') return <Scope {...scopeProps} role="status" className={join(p('my-auto flex justify-center text-secondary'), scopeProps?.className)}>
    <CodexCuSpinner /><span className={p('sr-only')}>{message(formatMessage, 'elicitation.page.connecting')}</span>
  </Scope>;
  if (status === 'unavailable') return <Scope {...scopeProps} className={join(p('my-auto flex flex-col gap-5'), scopeProps?.className)}>
    <p role="status">{message(formatMessage, 'elicitation.page.unavailable')}</p>{children}
  </Scope>;
  const ids = { failed: 'submissionFailed', accepted: 'responseSubmitted', declined: 'responseDeclined', canceled: 'responseCanceled' };
  return <Scope {...scopeProps} role="status" className={join(p('my-auto'), scopeProps?.className)}>
    <div className={p('w-full items-center px-3 flex flex-col justify-center py-6')}>
      <div className={p('flex w-full max-w-xl flex-col items-center text-center justify-center gap-3')}>
        <div className={p('flex flex-col items-center gap-2')}>
          <div className={p('text-lg leading-6 font-medium text-default')}><h1 className={p('select-none')}>{ids[status] ? message(formatMessage, `elicitation.page.${ids[status]}`) : null}</h1></div>
          <div className={p('text-sm text-secondary')}>{message(formatMessage, 'elicitation.page.checkConversationResult')}</div>
        </div>
      </div>
    </div>{children}
  </Scope>;
}

/** Source form presentation; validated link/account/connection decisions are external. */
export function CodexCloudAuthStandalonePage({ children, browserAuth, displaySiteName, responseStatus,
  pending = false, connecting = false, unavailable = false, onRetry, failedCanRetry = false, onTryAgain,
  formatMessage, locale, theme, windowType, fontPreset, opaque, className, ...formProps }) {
  formatMessage = useAuthFormat(formatMessage, locale);
  let content = children;
  if (content == null) {
    if (responseStatus === 'accepted' || responseStatus === 'declined') content = <div role="status" className={p('my-auto')}>
      <CodexCloudAuthHeader {...formProps} browserAuth={browserAuth} displaySiteName={displaySiteName} status={responseStatus} formatMessage={formatMessage} />
    </div>;
    else if (pending) content = <CodexCloudAuthStandaloneForm {...formProps} browserAuth={browserAuth} displaySiteName={displaySiteName} formatMessage={formatMessage} />;
    else content = <CodexCloudAuthStatus status={connecting ? 'connecting' : unavailable ? 'unavailable' : responseStatus ?? 'unavailable'} formatMessage={formatMessage}>
      {unavailable && onRetry ? <CodexCuButton color="secondary" onClick={onRetry}>{message(formatMessage, 'elicitation.page.retry')}</CodexCuButton> : null}
      {responseStatus === 'failed' && failedCanRetry ? <CodexCuButton color="secondary" onClick={onTryAgain}>{message(formatMessage, 'elicitation.page.tryAgain')}</CodexCuButton> : null}
    </CodexCloudAuthStatus>;
  }
  return <Scope theme={theme} windowType={windowType} fontPreset={fontPreset} opaque={opaque}
    className={join(p('flex h-dvh w-full flex-col overflow-y-auto bg-surface text-default'), className)}>
    <main aria-label={message(formatMessage, 'elicitation.page.title')} className={p('flex w-full shrink-0 grow flex-col items-center px-8 py-10')}>
      <div className={p('flex w-full max-w-sm flex-1 flex-col gap-8')}>{content}</div>
    </main>
  </Scope>;
}

/** a_l / fJc / rJc. Native material gate is explicitly supplied by the caller. */
export function CodexCloudAuthCard({ origin, source, onBack, backDisabled = false, backLabel, onSkip,
  skipDisabled = false, heading, description, children, actions, footerStart, error, loadRemote = true,
  surface = 'default', avatarOverlay = false, favicon, siteIcon, formatMessage, locale, className }) {
  formatMessage = useAuthFormat(formatMessage, locale);
  const material = surface === 'mini' || avatarOverlay;
  return <div className={join(p('w-[var(--browser-auth-card-width,var(--container-lg))] max-w-full', material ? '_Material_9q659_2' :
    'flex flex-col overflow-hidden text-default focus:outline-none rounded-3xl border border-default bg-surface-elevated-secondary',
    avatarOverlay && 'overflow-x-hidden overflow-y-auto overscroll-contain text-default focus:outline-none'), className)}
    data-avatar-overlay-material={material ? 'css' : undefined} data-avatar-overlay-material-variant={material ? 'transcript-card' : undefined}>
    <div className={p('flex min-w-0 flex-col gap-3 p-4')}>
      <div className={p('flex items-center justify-between gap-2')}>
        {onBack ? <CodexCuButton color="ghost" size="toolbar" uniform disabled={backDisabled}
          aria-label={backLabel ?? message(formatMessage, 'browserAuth.backToMethods')} onClick={onBack}><CodexCuIcon name="shared:p7" /></CodexCuButton> : null}
        <div className={p('flex min-w-0 flex-1 items-center')}>
          {source == null ? null : <div className={p('text-xs leading-normal text-secondary')}>{source}</div>}
          {source == null && origin != null ? <span className={p('flex min-w-0 items-center gap-1.5 text-xs leading-normal text-secondary')} dir="ltr">
            {siteIcon ?? <CodexCloudAuthSiteIcon {...favicon} loadRemote={loadRemote} className="icon-xs" />}
            <span className={p('break-all')}>{origin}</span>
          </span> : null}
        </div>
      </div>
      <div className={p('flex flex-col gap-1')}>
        <h2 className={p('text-base font-medium text-default select-none')}>{heading ?? (origin == null ? null : message(formatMessage, 'browserAuth.signInTitle', { site: new URL(origin).hostname }))}</h2>
        {description == null ? null : <p className={p('text-sm leading-5 text-secondary select-none')} role="status">{description}</p>}
      </div>
      {children}
      {error == null ? null : <p className={p('text-sm leading-5 text-danger')} role="alert">{error}</p>}
    </div>
    {actions != null || onSkip != null || footerStart != null ? <div className={p('flex flex-wrap items-center justify-end gap-2 border-t border-default px-4 py-3')}>
      {footerStart == null ? null : <div className={p('me-auto')}>{footerStart}</div>}
      <div className={p('flex flex-wrap items-center justify-end gap-2')}>
        {onSkip ? <CodexCuButton color="secondary" size="dialog" disabled={skipDisabled}
          onClick={event => { if (event.detail <= 1) onSkip(); }}>{message(formatMessage, 'browserAuth.skipRequest')}</CodexCuButton> : null}{actions}
      </div>
    </div> : null}
  </div>;
}

function SplitAction({ children, type = 'button', disabled = false, loading = false, menuDisabled = false,
  onClick, onManualSignIn, manualSignInDisabled = false, onEnterManually, enterManuallyDisabled = false,
  credentialOptions, actionMenuOpen, onActionMenuOpenChange, renderActionMenu, formatMessage }) {
  if (onManualSignIn == null && onEnterManually == null && credentialOptions == null) return <CodexCuButton size="dialog" type={type}
    disabled={disabled} loading={loading} onClick={() => { if (type !== 'submit') onClick?.(); }}>{children}</CodexCuButton>;
  return <CodexCuSplitButton dropdownOpen={actionMenuOpen} onDropdownOpenChange={onActionMenuOpenChange}
    size="dialog" radius="full" separated type={type} primaryDisabled={disabled} loading={loading}
    dropdownDisabled={menuDisabled || loading} onClick={() => { if (type !== 'submit') onClick?.(); }}
    dropdownAlign="end" dropdownContentWidth="panelWide" renderLayer={renderActionMenu}
    secondaryAriaLabel={message(formatMessage, 'browserAuth.otherSignInOptions')}
    dropdownContent={<>
      {credentialOptions == null ? <CodexCuMenuItem disabled={disabled || loading} onSelect={onClick}>{children}</CodexCuMenuItem> : credentialOptions}
      {onEnterManually ? <CodexCuMenuItem disabled={enterManuallyDisabled} onSelect={onEnterManually}>{message(formatMessage, 'browserAuth.confirmation.enterManually')}</CodexCuMenuItem> : null}
      {onManualSignIn ? <CodexCuMenuItem disabled={manualSignInDisabled} onSelect={onManualSignIn}>{message(formatMessage, 'browserAuth.confirmation.signInOnWebPage')}</CodexCuMenuItem> : null}
    </>}>{children}</CodexCuSplitButton>;
}

function InputGroup({ children }) { return <div className={p('_inputGroup_1jhuu_1 divide-y divide-border overflow-hidden rounded-xl border border-default text-sm text-default')}>{children}</div>; }

/** QR data comes from the private main process; no remote polling or payload generation. */
export function CodexCloudAuthQrCode({ matrix, imageDataUrl, status = 'ready', requiresApp = false, compact = false, formatMessage, locale }) {
  formatMessage = useAuthFormat(formatMessage, locale);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [imageDataUrl]);
  const localImage = typeof imageDataUrl === 'string' && /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(imageDataUrl) && !imageFailed;
  if (status === 'waiting') return <p className={p('text-center text-sm text-secondary select-none')} role="status">{message(formatMessage, 'browserAuth.qrCode.waiting')}</p>;
  if (['unavailable', 'disappeared', 'expired'].includes(status) || !matrix && !localImage) return <p className={p('text-center text-sm text-secondary select-none')} role="status">{message(formatMessage, 'browserAuth.qrCode.unavailable')}</p>;
  const fullSize = matrix ? matrix.size + 8 : 0;
  const path = matrix ? Array.from(matrix.data).flatMap((cell, index) => cell ? [`M${index % matrix.size + 4},${Math.floor(index / matrix.size) + 4}h1v1h-1z`] : []).join('') : '';
  return <div className={p('flex flex-col items-center gap-3')}>
    <div className={p('max-w-full shrink-0 self-center', compact ? 'size-40' : 'size-60')} data-dd-privacy="hidden">
      {localImage ? <img className={p('size-full rounded-xl')} style={{objectFit:'contain',backgroundColor:'white'}} alt={message(formatMessage, 'browserAuth.qrCode.label')}
        data-dd-privacy="hidden" draggable={false} referrerPolicy="no-referrer" src={imageDataUrl} onError={() => setImageFailed(true)} /> : <svg className={p('size-full rounded-xl')} aria-label={message(formatMessage, 'browserAuth.qrCode.label')}
        data-dd-privacy="hidden" focusable="false" role="img" shapeRendering="crispEdges" viewBox={`0 0 ${fullSize} ${fullSize}`}>
        <rect width={fullSize} height={fullSize} fill="white" /><path d={path} fill="black" />
      </svg>}
    </div>
    {requiresApp ? <p className={p('text-center text-sm text-secondary select-none')}>{message(formatMessage, 'browserAuth.qrCode.requiresApp')}</p> : null}
  </div>;
}

/** R_l; saved-account availability and QR completion are controlled inputs. */
export function CodexCloudAuthCredentialsForm({ browserAuth, busy = false, preparing = false, disabled = false,
  submissionDisabled = false, saveEnabled = false, saveFieldIds, savedAccountPicker, credentialOptions, alternateAction,
  error, openHelpExternally = false, onOpenHelp, onManualSignIn, onEdit, initialSelectedOptionId,
  allowImplicitSubmission = false, onSubmit, onDecline, qr = {}, optionIcons = {}, fieldValues, onFieldChange,
  actionMenuOpen, onActionMenuOpenChange, renderActionMenu, formatMessage, locale, ...cardProps }) {
  formatMessage = useAuthFormat(formatMessage, locale);
  const form = useRef(null), submitting = useRef(false), checkboxId = useId();
  const [remember, setRemember] = useState(false), [selectedId, setSelectedId] = useState(initialSelectedOptionId);
  const [showPassword, setShowPassword] = useState(false), [valid, setValid] = useState(false);
  const working = busy || preparing, optionsExist = (browserAuth.options?.length ?? 0) > 0;
  let qrPayload = browserAuth.qrCodePayload != null && browserAuth.qrCodePayload !== '' ? browserAuth.qrCodePayload : null;
  if (qrPayload == null && browserAuth.qrCodeUrl != null) {
    try { const url = new URL(browserAuth.qrCodeUrl); if (url.protocol === 'https:' && url.hostname.length > 0 && url.username.length === 0 && url.password.length === 0) qrPayload = browserAuth.qrCodeUrl; } catch { /* P_l returns false. */ }
  }
  const qrFlow = browserAuth.qrCode === true || qrPayload != null;
  const options = browserAuth.options ?? [], selected = options.find(option => option.id === selectedId);
  const chooseMethods = optionsExist && (selected == null || selected.fieldIds.length === 0);
  const fields = optionsExist ? browserAuth.fields.filter(field => selected?.fieldIds.includes(field.id)) : browserAuth.fields;
  const singleCode = fields.length === 1 && fields[0].autocomplete === 'one-time-code';
  const manualFields = !optionsExist && fields.length > 0;
  const canRemember = saveEnabled && (saveFieldIds?.every(id => fields.some(field => field.id === id)) ?? true);
  const qrComplete = qrFlow && browserAuth.fields.length === 0 && !optionsExist && browserAuth.webauthn == null && (qrPayload != null || qr.payloadAvailableScopeMatch === true);
  const savedChoices = credentialOptions != null && !qrFlow;
  const clear = target => { (target ?? form.current)?.reset(); setValid(false); setShowPassword(false); setRemember(false); cardProps.onClearFields?.(); };
  const submit = async option => {
    if (!onSubmit || disabled || working || submissionDisabled || submitting.current ||
      !allowImplicitSubmission && !valid && !qrComplete && option == null || optionsExist && selected == null && option == null || !form.current?.reportValidity()) return;
    const target = form.current, values = {};
    for (const field of fields) { const input = target.elements.namedItem(`browser-auth-field-${field.id}`); if (input?.value.length > 0) values[field.id] = { value: input.value }; }
    if (manualFields && Object.keys(values).length === 0) return;
    submitting.current = true;
    if (option) setSelectedId(option.id);
    try { await onSubmit(values, (option ?? selected)?.id, canRemember && remember); }
    finally { clear(target); submitting.current = false; }
  };
  if (!qrFlow && browserAuth.fields.length === 0 && !optionsExist) return <CodexCloudAuthCard {...cardProps}
    origin={browserAuth.origin} loadRemote={!disabled} formatMessage={formatMessage} error={error}
    description={message(formatMessage, 'browserAuth.continueOnWebsite')} onSkip={onDecline} skipDisabled={disabled || working}
    actions={<CodexCuButton size="dialog" disabled={disabled || working || !onManualSignIn} onClick={onManualSignIn}>{message(formatMessage, 'browserAuth.recoveryTakeOver')}</CodexCuButton>} />;
  let description;
  if (!chooseMethods && !(singleCode && !qrFlow)) description = qrFlow ? message(formatMessage, 'browserAuth.qrCode.instructions')
    : message(formatMessage, 'browserAuth.descriptionWithHelp', { link: helpLink(onOpenHelp, openHelpExternally) });
  const actionId = preparing ? 'browserAuth.preparing' : busy ? 'browserAuth.sending' : singleCode ? 'browserAuth.continueWithVerificationCode'
    : qrComplete ? 'browserAuth.qrCode.done' : 'browserAuth.submit';
  return <form ref={form} aria-label={message(formatMessage, 'browserAuth.signInTitle', { site: new URL(browserAuth.origin).hostname })}
    data-dd-privacy="mask" onChange={onEdit} onSubmit={event => { event.preventDefault(); submit(); }}>
    <CodexCloudAuthCard {...cardProps} origin={browserAuth.origin} loadRemote={!disabled} formatMessage={formatMessage} error={error}
      heading={singleCode ? message(formatMessage, 'browserAuth.verificationCodeHeading') : undefined} description={description}
      onBack={chooseMethods || selected == null ? undefined : () => { onEdit?.(); clear(); setSelectedId(undefined); }} backDisabled={disabled || working}
      onSkip={() => { clear(); onDecline?.(); }} skipDisabled={busy}
      footerStart={(chooseMethods || !savedChoices) && onManualSignIn ? <CodexCuButton color="secondary" size="dialog" disabled={disabled || busy}
        onClick={() => { clear(); onManualSignIn(); }}>{message(formatMessage, 'browserAuth.confirmation.signInOnWebPage')}</CodexCuButton> : null}
      actions={<>{!qrFlow && alternateAction}{!chooseMethods ? <SplitAction actionMenuOpen={actionMenuOpen} onActionMenuOpenChange={onActionMenuOpenChange}
        renderActionMenu={renderActionMenu} type="submit" onClick={() => form.current?.requestSubmit()} menuDisabled={disabled || busy}
        onManualSignIn={savedChoices && onManualSignIn ? () => { clear(); onManualSignIn(); } : undefined}
        credentialOptions={savedChoices ? credentialOptions : undefined} disabled={!onSubmit || disabled || !valid && !qrComplete || working || submissionDisabled}
        loading={working} formatMessage={formatMessage}>{message(formatMessage, actionId)}</SplitAction> : null}</>}>
      {qrFlow ? <CodexCloudAuthQrCode {...qr} formatMessage={formatMessage} /> : null}{savedAccountPicker}
      {chooseMethods ? <div className={p('flex flex-col gap-2')}>
        {options.map(option => { const icon = Object.prototype.hasOwnProperty.call(optionIcons, option.id) ? optionIcons[option.id] : getCodexCloudAuthOptionIcon(option, browserAuth.fields);
          return <CodexCuButton key={option.id} className={icon ? 'cuc-gap-2' : undefined}
          color="secondary" size="dialog" radius="full" disabled={disabled || working || submissionDisabled}
          aria-busy={working && selectedId === option.id} onClick={() => { onEdit?.(); clear(); option.fieldIds.length === 0 ? submit(option) : setSelectedId(option.id); }}>
          {icon}{option.label}{working && selectedId === option.id ? <CodexCuSpinner className={p('icon-xxs ms-auto shrink-0')} /> : null}
        </CodexCuButton>; })}
      </div> : fields.length > 0 ? <InputGroup>{fields.map(field => <div key={field.id} className={p('flex min-w-0 items-center gap-2')}>
        <CodexCuSettingsInput variant="grouped" focusRing={false} aria-label={field.label} autoComplete={field.autocomplete ?? 'off'}
          data-1p-ignore="true" data-lpignore="true" disabled={disabled || working} name={`browser-auth-field-${field.id}`}
          placeholder={field.label} required={field.required} value={fieldValues?.[field.id]} type={field.type === 'password' && showPassword ? 'text' : field.type}
          onKeyDown={event => { if (allowImplicitSubmission && event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }}
          trailingControl={field.type === 'password' ? <CodexCuButton color="ghost" size="iconCircle" disabled={disabled || working}
            aria-label={message(formatMessage, showPassword ? 'browserAuth.hidePassword' : 'browserAuth.showPassword')} aria-pressed={showPassword}
            onClick={() => setShowPassword(value => !value)}><CodexCuIcon name={showPassword ? 'shared:fft' : 'shared:qet'} /></CodexCuButton> : undefined}
          onChange={event => { onFieldChange?.(field.id, event.target.value); const inputs = fields.map(item => form.current?.elements.namedItem(`browser-auth-field-${item.id}`));
            setValid(inputs.every(input => input?.validity.valid) && (!manualFields || inputs.some(input => input?.value.length > 0))); }} />
      </div>)}</InputGroup> : null}
      {canRemember ? <label className={p('relative flex items-center gap-2 text-sm leading-4.5 text-default select-none')} htmlFor={checkboxId}>
        <CodexCuSettingsCheckbox id={checkboxId} checked={remember} disabled={disabled || working} onCheckedChange={setRemember} />
        {message(formatMessage, 'browserAuth.remember')}
      </label> : null}
    </CodexCloudAuthCard>
  </form>;
}

/** d_l; account label and a fixed redaction never load a stored password. */
export function CodexCloudAuthSavedAccountConfirmation({ intent, siteName, origin, providerName, providerIcon, accountLabel,
  onConfirm, onDecline, onEnterManually, onManualSignIn, credentialOptions, alternateAction, busy = false,
  preparing = false, disabled = false, submissionDisabled = false, error, openHelpExternally = false, onOpenHelp,
  children, actionMenuOpen, onActionMenuOpenChange, renderActionMenu, formatMessage, locale, ...cardProps }) {
  formatMessage = useAuthFormat(formatMessage, locale);
  const heading = intent === 'save' ? 'browserAuth.confirmation.saveTitle' : intent === 'authorize' ? 'browserAuth.confirmation.authorizeTitle' : 'browserAuth.confirmation.useTitle';
  const description = intent === 'use' ? message(formatMessage, 'browserAuth.confirmation.useDescriptionWithHelp', { provider: providerName, link: helpLink(onOpenHelp, openHelpExternally) })
    : busy || preparing ? message(formatMessage, 'browserAuth.confirmation.pending')
      : message(formatMessage, intent === 'save' ? 'browserAuth.confirmation.saveDescription' : 'browserAuth.confirmation.authorizeDescription', { provider: providerName, site: siteName });
  const action = intent === 'save' ? 'browserAuth.confirmation.save' : intent === 'authorize' ? 'browserAuth.confirmation.authorize'
    : preparing ? 'browserAuth.preparing' : busy ? 'browserAuth.sending' : 'browserAuth.confirmation.use';
  return <CodexCloudAuthCard {...cardProps} origin={origin} loadRemote={!disabled} formatMessage={formatMessage} error={error}
    source={intent === 'use' ? undefined : <span className={p('flex items-center gap-1.5')}>{providerIcon}{providerName}</span>}
    onSkip={intent === 'use' ? onDecline : undefined} skipDisabled={busy} heading={message(formatMessage, heading, { provider: providerName })}
    description={description} actions={<>{alternateAction}{intent === 'use' ? null : <CodexCuButton color="secondary" disabled={busy} size="dialog"
      onClick={event => { if (event.detail <= 1) onDecline?.(); }}>{message(formatMessage, 'browserAuth.confirmation.decline')}</CodexCuButton>}
      <SplitAction actionMenuOpen={actionMenuOpen} onActionMenuOpenChange={onActionMenuOpenChange} renderActionMenu={renderActionMenu}
        loading={busy || preparing} disabled={disabled || submissionDisabled || busy || preparing} menuDisabled={busy}
        onManualSignIn={intent === 'use' ? onManualSignIn : undefined} manualSignInDisabled={disabled}
        onEnterManually={onEnterManually} enterManuallyDisabled={busy || preparing} credentialOptions={credentialOptions}
        onClick={onConfirm} formatMessage={formatMessage}>{message(formatMessage, action)}</SplitAction></>}>
    {intent === 'use' ? <InputGroup><div className={p('px-3 py-2.5 break-words')} data-dd-privacy="mask">{accountLabel}</div>
      <div className={p('px-3 py-2.5')} aria-label={message(formatMessage, 'browserAuth.confirmation.redactedPassword')}><span aria-hidden="true">{'•'.repeat(12)}</span></div>
    </InputGroup> : <div className={p('mt-1 flex min-w-0 items-center gap-3 rounded-xl border border-default px-3 py-2.5')} data-dd-privacy="mask">
      <CodexCloudAuthSiteIcon {...cardProps.favicon} className="size-8" />
      <div className={p('flex min-w-0 flex-col')}><span className={p('text-sm leading-normal font-medium break-words text-default')}>{accountLabel}</span>
        <span className={p('text-xs leading-normal break-words text-secondary')}>{new URL(origin).hostname}</span></div>
    </div>}
    {intent === 'authorize' ? <p className={p('text-sm text-secondary')}>{message(formatMessage, 'browserAuth.confirmation.disclosure')}</p> : null}{children}
  </CodexCloudAuthCard>;
}

export function CodexCloudAuthManualSignIn({ browserAuth, disabled = false, onBack, onSkip, onDone, formatMessage, locale, ...cardProps }) {
  formatMessage = useAuthFormat(formatMessage, locale);
  return <CodexCloudAuthCard {...cardProps} origin={browserAuth.origin} onBack={onBack} backDisabled={disabled}
    backLabel={message(formatMessage, 'browserAuth.backToSignIn')} loadRemote={!disabled}
    heading={message(formatMessage, 'chatgptConversations.cloudBrowser.auth.waiting')} description={null} formatMessage={formatMessage}
    actions={<><CodexCuButton color="secondary" size="dialog" onClick={onSkip}>{message(formatMessage, 'browserAuth.manualSignIn.notNow')}</CodexCuButton>
      <CodexCuButton size="dialog" onClick={onDone}>{message(formatMessage, 'chatgptConversations.cloudBrowser.auth.done')}</CodexCuButton></>} />;
}

/** J_l; entry references and labels remain masked and no credential value is read. */
export function CodexCloudAuthSavedLogins({ logins, selectedLoginId, onSelectLogin, disabled = false, formatMessage, locale }) {
  formatMessage = useAuthFormat(formatMessage, locale);
  return <CodexCuMenuRadioGroup value={selectedLoginId} onValueChange={onSelectLogin}>
    {logins.map(login => <CodexCuMenuRadioItem key={login.id} value={login.id} disabled={disabled || login.disabled}
      icon={login.icon} SubText={<span data-dd-privacy="mask">{message(formatMessage, 'browserAuth.loginPicker.entryAndProvider', { reference: login.reference, provider: login.providerName })}</span>}>
      <span data-dd-privacy="mask">{login.accountLabel}</span>
    </CodexCuMenuRadioItem>)}
  </CodexCuMenuRadioGroup>;
}

/** Q_l with the source OT/mNi and jT/_Ni default body/section wrappers. */
export function CodexCloudAuthOptionsLoading({ formatMessage, locale, debugBody, debugSection, debugClassName }) {
  formatMessage = useAuthFormat(formatMessage, locale);
  return <div className={join(p('flex flex-col text-base leading-normal tracking-normal gap-0 _body_1rxrl_2'), debugClassName)}>
    {debugBody}<div className={join(p('flex w-full flex-col _section_1rxrl_2 select-none'), debugClassName)}>
      {debugSection}<div className={p('flex h-full items-center justify-center')} role="status">
        <CodexCuSpinner /><span className={p('sr-only')}>{message(formatMessage, 'browserAuth.loadingSignInOptions')}</span>
      </div>
    </div>
  </div>;
}

/** nvl's visual projection. Query timing, availability, selection expiry and fill are supplied. */
export function CodexCloudAuthPrompt({ browserAuth, waitingForOptions = false, loadingContent, selectedAccount,
  selectedExpired = false, lookupFailed = false, selectionsExpired = false, isFetchingCandidates = false,
  savedLoginsAvailable = false, logins, selectedLoginId, onSelectLogin, hasMoreLogins = false, onLoadMoreLogins,
  credentialOptions, alternateAction, busy = false, preparing = false, disabled = false, submissionDisabled = false,
  recoveryUnavailable = false, error, onConfirmSaved, onEnterManually, onRetryLookup, onManualSignIn, onDecline,
  formatMessage, locale, ...props }) {
  formatMessage = useAuthFormat(formatMessage, locale);
  if (waitingForOptions) return loadingContent ?? <CodexCloudAuthOptionsLoading formatMessage={formatMessage} />;
  const choices = credentialOptions ?? (savedLoginsAvailable && ((logins?.length ?? 0) > 0 || hasMoreLogins) ? <>
    {(logins?.length ?? 0) > 0 ? <CodexCloudAuthSavedLogins logins={logins} selectedLoginId={selectedExpired ? undefined : selectedLoginId}
      disabled={disabled || busy || preparing || submissionDisabled} onSelectLogin={onSelectLogin} formatMessage={formatMessage} /> : null}
    {hasMoreLogins ? <CodexCuMenuItem disabled={disabled || isFetchingCandidates || busy || preparing}
      onSelect={event => { event.preventDefault(); onLoadMoreLogins?.(); }}>{message(formatMessage, 'browserAuth.moreLogins')}</CodexCuMenuItem> : null}
  </> : undefined);
  if (recoveryUnavailable) return <CodexCloudAuthCard {...props} origin={browserAuth.origin} loadRemote={!disabled}
    description={message(formatMessage, 'browserAuth.recoveryUnavailable')} onSkip={onDecline} skipDisabled={busy} formatMessage={formatMessage}
    actions={<CodexCuButton size="dialog" disabled={disabled || busy || !onManualSignIn} onClick={onManualSignIn}>{message(formatMessage, 'browserAuth.recoveryTakeOver')}</CodexCuButton>} />;
  if (selectedAccount != null) return <CodexCloudAuthSavedAccountConfirmation {...props} intent="use" origin={browserAuth.origin}
    siteName={new URL(browserAuth.origin).hostname} providerName="Passwords" accountLabel={selectedAccount.accountLabel}
    credentialOptions={choices} alternateAction={alternateAction} busy={busy} preparing={preparing} disabled={disabled}
    submissionDisabled={submissionDisabled || selectedExpired} error={selectedExpired ? message(formatMessage, 'browserAuth.selectionExpired') : error}
    onDecline={onDecline} onManualSignIn={onManualSignIn} onEnterManually={onEnterManually} onConfirm={onConfirmSaved} formatMessage={formatMessage} />;
  const picker = savedLoginsAvailable && (lookupFailed || selectionsExpired) ? <div className={p('flex flex-wrap items-center gap-2')}>
    {lookupFailed ? <span className={p('text-sm leading-5 text-danger')} role="alert">{message(formatMessage, 'browserAuth.lookupFailed')}</span> : null}
    <CodexCuButton color="secondary" size="dialog" disabled={disabled || isFetchingCandidates || busy || preparing}
      onClick={onRetryLookup}>{message(formatMessage, 'browserAuth.retryLookup')}</CodexCuButton>
  </div> : undefined;
  return <CodexCloudAuthCredentialsForm {...props} browserAuth={browserAuth} busy={busy} preparing={preparing} disabled={disabled}
    submissionDisabled={submissionDisabled} error={error} credentialOptions={choices} alternateAction={alternateAction}
    savedAccountPicker={picker} onManualSignIn={onManualSignIn} onDecline={onDecline} formatMessage={formatMessage} />;
}

/** fvl; no fill or save retry is inferred from an uncertain receipt. */
export function CodexCloudAuthCredentialReceipt({ inCard = false, fillStatus, saveStatus, checking = false,
  onCheckStatus, onInspectBrowser, onDone, doneLabel, formatMessage, locale }) {
  formatMessage = useAuthFormat(formatMessage, locale);
  let id;
  if (fillStatus === 'unknown') id = 'browserAuth.receipt.unknown';
  else if (fillStatus === 'not_submitted') id = saveStatus === 'saved' ? 'browserAuth.receipt.notSubmittedSaved' : saveStatus === 'unknown' ? 'browserAuth.receipt.notSubmittedSaveUnknown' : 'browserAuth.receipt.notSubmitted';
  else if (fillStatus === 'submitted') id = ({ saved: 'enteredSaved', not_requested: 'entered', failed: 'enteredSaveFailed', unknown: 'enteredSaveUnknown' })[saveStatus];
  if (id && !id.startsWith('browserAuth.')) id = `browserAuth.receipt.${id}`;
  const canCheck = fillStatus !== 'unknown' && saveStatus === 'unknown' && onCheckStatus != null;
  return <div className={p('flex w-full min-w-0 flex-col gap-2 text-sm text-default')} role="status">
    {id ? message(formatMessage, id) : null}
    {canCheck || fillStatus === 'unknown' && onInspectBrowser != null || onDone != null ? <div className={p('flex flex-wrap justify-end gap-2', inCard && '-mx-4 -mb-4 mt-2 border-t border-default px-4 py-3')}>
      {onDone ? <CodexCuButton color="secondary" size="dialog" disabled={checking} onClick={event => { if (event.detail <= 1) onDone(); }}>{doneLabel ?? message(formatMessage, 'browserAuth.receipt.done')}</CodexCuButton> : null}
      {canCheck ? <CodexCuButton color="secondary" size="dialog" loading={checking} onClick={onCheckStatus}>{message(formatMessage, 'browserAuth.receipt.check')}</CodexCuButton> : null}
      {fillStatus === 'unknown' && onInspectBrowser ? <CodexCuButton size="dialog" onClick={onInspectBrowser}>{message(formatMessage, 'browserAuth.receipt.inspect')}</CodexCuButton> : null}
    </div> : null}
  </div>;
}

/** Pure projection of En's pending request identity gate; no state reads or writes. */
export function codexCloudAuthCanRespond({ request, snapshot, normalizedAuth, auth, readError = false }) {
  return !readError && snapshot?.can_respond === true && snapshot.runtime_status === 'pending' && normalizedAuth?.kind === 'browserAuth' &&
    snapshot.elicitation.request_id === request.request_id && snapshot.elicitation.thread_id === request.thread_id &&
    (snapshot.elicitation.turn_id ?? null) === (request.turn_id ?? null) && normalizedAuth.challengeId === auth.challengeId;
}

function recoveryDescription(formatMessage, state, ended, fetching) {
  const id = ended ? 'ended' : state === 'unconfirmed' ? 'unconfirmed' : state === 'failed' ? 'failed' : fetching ? 'loading' : 'unavailable';
  return message(formatMessage, `aeon.messaging.browserAuth.${id}`);
}

/** En's visual branches. The host supplies query results, durable states and intent callbacks. */
export function CodexCloudAuthRecoveryCard({ request, browserAuth, operation, state = 'ready', presentation = 'message',
  canRespond = false, ended = false, isFetching = false, readError = false, requestLoading = false,
  operationPending = false, operationError = false, remoteLoadState, runtimeStatus, receivedFill = false,
  open = false, onOpenChange, onOpenInThread, embedded = false, onInspectRequest, onInspectBrowser,
  onReconcile, onResume, onDecline, onSubmit, onManualSignIn, onManualBack, onManualDone,
  receiptProps, credentialsProps, manualProps, sourceIcon, displaySiteName, formatMessage, locale,
  theme, windowType, fontPreset, opaque, className, avatarOverlay = false, ...cardProps }) {
  formatMessage = useAuthFormat(formatMessage, locale);
  const receipt = state === 'sent' || state === 'declined' || operation == null && (request.status === 'resolved' || runtimeStatus === 'resolved') || ended && operation?.fill_status === 'submitted';
  const submittingFilled = state === 'submitting' && operation?.fill_status === 'submitted';
  const manual = state === 'manual' && canRespond && !ended;
  const loadRemote = remoteLoadState === 'disabled';
  const common = { ...cardProps, browserAuth, avatarOverlay, formatMessage };
  const pageScope = { theme, windowType, fontPreset, opaque, className };
  if (presentation === 'page' && receipt) {
    if (state === 'declined' && operation != null) return <Scope {...pageScope} className={join(p('my-auto'), className)}>
      <CodexCloudAuthCredentialReceipt {...receiptProps} fillStatus={operation.fill_status === 'submitted' || operation.fill_status === 'unknown' ? operation.fill_status : 'not_submitted'}
        saveStatus={operation.save_status} onCheckStatus={operation.fill_status === 'unknown' || operation.statusAvailable === false ? undefined : onReconcile} formatMessage={formatMessage} />
    </Scope>;
    if (state === 'sent' || state === 'declined') return <Scope {...pageScope} role="status" className={join(p('my-auto'), className)}>
      <CodexCloudAuthHeader browserAuth={browserAuth} displaySiteName={displaySiteName} status={state === 'sent' ? 'accepted' : 'declined'}
        loadRemote={loadRemote} formatMessage={formatMessage} {...cardProps} />
    </Scope>;
    return <CodexCloudAuthStatus status="unavailable" formatMessage={formatMessage} scopeProps={pageScope} />;
  }
  if (presentation === 'page' && state === 'ready' && !ended && (requestLoading || canRespond && operation == null && (operationPending || remoteLoadState === 'loading')))
    return <CodexCloudAuthStatus status="connecting" formatMessage={formatMessage} scopeProps={pageScope} />;
  let content;
  if (receipt || submittingFilled && presentation !== 'page') content = null;
  else if (operation != null && !(submittingFilled && receivedFill)) {
    const inspect = (state === 'unconfirmed' && operation.fill_status !== 'unknown' || !canRespond && operation.fill_status === 'unknown' && operation.statusAvailable === false) && !ended;
    content = <CodexCloudAuthCard {...common} origin={browserAuth.origin} loadRemote={loadRemote} description={null}
      actions={inspect ? <CodexCuButton color="secondary" size="dialog" disabled={isFetching} onClick={onInspectRequest}>{message(formatMessage, 'aeon.messaging.browserAuth.inspect')}</CodexCuButton> : null}>
      <CodexCloudAuthCredentialReceipt {...receiptProps} inCard fillStatus={operation.fill_status === 'submitted' || operation.fill_status === 'unknown' ? operation.fill_status : 'not_submitted'}
        saveStatus={operation.save_status} onInspectBrowser={onInspectBrowser}
        onDone={canRespond && operation.fill_status === 'unknown' && state !== 'submitting' ? onDecline : undefined}
        doneLabel={message(formatMessage, 'browserAuth.savedCredentials.outcome.skipUnknownManual')}
        onCheckStatus={operation.fill_status === 'unknown' || operation.statusAvailable === false ? undefined : onReconcile} formatMessage={formatMessage} />
      {canRespond && state === 'ready' && operation.fill_status !== 'unknown' ? <CodexCuButton size="dialog" onClick={onResume}>{message(formatMessage, 'aeon.messaging.browserAuth.resume')}</CodexCuButton> : null}
      {state === 'unconfirmed' && operation.fill_status !== 'unknown' && !ended ? recoveryDescription(formatMessage, state, ended, isFetching) : null}
    </CodexCloudAuthCard>;
  } else if (manual) content = <CodexCloudAuthManualSignIn {...common} {...manualProps} disabled={remoteLoadState !== 'disabled'}
    onBack={presentation === 'message' && open ? onManualBack : undefined} onSkip={onDecline} onDone={onManualDone} />;
  else if (canRespond && !ended && ['ready', 'preparing', 'submitting'].includes(state)) content = <CodexCloudAuthPrompt {...common} {...credentialsProps}
      loadingContent={presentation === 'page' ? <CodexCloudAuthStatus status="connecting" formatMessage={formatMessage} /> : credentialsProps?.loadingContent}
      recoveryUnavailable={operationError || credentialsProps?.recoveryUnavailable} busy={state === 'submitting'} preparing={state === 'preparing'}
      disabled={remoteLoadState !== 'disabled'} submissionDisabled={operationPending || operationError || state === 'preparing'}
      onSubmit={onSubmit} onDecline={onDecline} onManualSignIn={onManualSignIn} />;
  else content = <CodexCloudAuthCard {...common} origin={browserAuth.origin} loadRemote={loadRemote}
    description={recoveryDescription(formatMessage, state, ended, isFetching)}
    actions={ended ? null : <CodexCuButton color="secondary" size="dialog" disabled={isFetching} onClick={onInspectRequest}>{message(formatMessage, 'aeon.messaging.browserAuth.inspect')}</CodexCuButton>}
    error={readError ? message(formatMessage, 'aeon.messaging.browserAuth.inspectError') : undefined} />;
  let body;
  {
    const label = operation?.fill_status === 'submitted' ? message(formatMessage, 'aeon.messaging.browserAuth.entered')
      : receipt || ended ? message(formatMessage, 'aeon.messaging.browserAuth.closed')
        : message(formatMessage, 'aeon.messaging.browserAuth.open', { site: new URL(browserAuth.origin).hostname });
    const trigger = <CodexCuButton className={p('max-w-full')} color="conversationAccentSubtle" size="actionChipWithIcon" radius="full"
      onClick={content == null ? undefined : onOpenInThread} aria-disabled={content == null} disabledAppearance="unchanged">
      <span className={p('flex shrink-0 items-center justify-center rounded-full bg-white p-1.5')}>{sourceIcon ?? <CodexCuIcon name="card:hn" aria-hidden="true" />}</span>
      <span className={p('min-w-0 break-words whitespace-normal')} aria-live="polite">{label}</span>
      {operation?.fill_status === 'submitted' ? <CodexCuIcon name="shared:M9" /> : content != null ? <CodexCuIcon name="shared:Qrt" /> : null}
    </CodexCuButton>;
    if (onOpenInThread) body = operation?.fill_status !== 'submitted' && (request.status === 'expired' || runtimeStatus === 'expired')
      ? <CodexCloudAuthCard {...common} surface="mini" origin={browserAuth.origin} loadRemote={loadRemote}
        description={recoveryDescription(formatMessage, 'ready', true, false)} actions={null} />
      : receipt || ended ? embedded ? <div className={p('flex min-w-0 flex-col gap-2 text-default')} data-avatar-overlay-foreground><span role="status">{label}</span></div>
        : <div className={p('_Material_9q659_2')} data-avatar-overlay-material="css" data-avatar-overlay-material-variant="transcript-message">
          <div className={p('flex min-w-0 flex-col gap-2 text-default')} data-avatar-overlay-foreground><span role="status">{label}</span></div>
        </div> : trigger;
    else if (presentation === 'page') body = content;
    else body = <>
      <CodexCuDialog open={open && content != null} onOpenChange={next => { if (state !== 'preparing') onOpenChange?.(next && content != null); }}
        size="large" variant="form" contentPosition="scrollable" contentProps={{ 'aria-describedby': undefined, style: { '--browser-auth-card-width': '100%' } }} triggerContent={trigger}>
        <CodexCuDialogTitle className={p('sr-only')}>{browserAuth.reason}</CodexCuDialogTitle>{content}
      </CodexCuDialog>
      {manual && !open ? <div className={p('mt-2')}>{content}</div> : null}
    </>;
  }
  return <Scope theme={theme} windowType={windowType} fontPreset={fontPreset} opaque={opaque}
    className={join(p(!onOpenInThread && (presentation === 'page' ? 'flex w-full max-w-lg min-w-0 flex-1 flex-col py-2' : 'w-full max-w-lg min-w-0 py-2')), className)}>{body}</Scope>;
}

/** vn. The source's shared summary Section is supplied intact by renderSection. */
export function CodexCloudBrowserSummaryEntry({ conversationId, screenshots, onOpen, previewProps,
  renderSection = renderCodexCuSummarySection, formatMessage, locale }) {
  formatMessage = useAuthFormat(formatMessage, locale);
  if (screenshots.length === 0) return null;
  const content = <CodexCloudBrowserPreview {...previewProps} screenshots={screenshots}
    onOpen={() => onOpen?.({ conversationId, preserveReplay: true })} />;
  return renderSection({ sectionKey: 'chatgpt-cloud-browser', title: message(formatMessage, 'chatgptConversations.summaryPanel.cloudBrowser.title'), children: content });
}

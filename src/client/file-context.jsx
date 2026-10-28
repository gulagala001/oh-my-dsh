import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { MarkdownDelegateProvider } from '@deepseek-ai/dsh-client-ui-primitives';
import { absolutePath, directoryAt, resolveFilePath, fileImageUrl } from '../file-paths.mjs';
import { decorateSlotComponent } from './slot-decoration.mjs';

const FileContext = createContext(null);
const directoryPending = Symbol('file-directory-pending');

function useDirectory(props, seq) {
  const initial = props.useSessions(state => state.byId[props.sessionId]?.cwd);
  const recorded = props.useProjection('omdOverview', value => seq !== undefined && value?.directories
    ? directoryAt(value.directories, seq, initial) : undefined);
  const current = props.useProjection('workingDirectory', value => recorded === undefined ? value : undefined);
  return seq === undefined ? current ?? initial
    : recorded ?? (current ? undefined : initial);
}

function useFileActions(props, cwd, historical = false) {
  const openFile = useCallback((path, options) => {
    // Let the native Chat opener own errors, line navigation and resource tabs.
    if (options?.[directoryPending] || !cwd && !absolutePath(path) && !historical) return Promise.reject(Error('文件目录信息尚未加载，请稍后重试。'));
    if (!cwd && !absolutePath(path)) return props.openFile(path, { ...options, [directoryPending]: true });
    return props.openFile(resolveFilePath(cwd, path), options);
  }, [props.openFile, cwd, historical]);
  const useSessions = useCallback((select, equal) => props.useSessions(state => {
    const row = state.byId[props.sessionId];
    return !row || cwd === undefined || row.cwd === cwd ? select(state)
      : select({ ...state, byId: { ...state.byId, [props.sessionId]: { ...row, cwd } } });
  }, equal), [props.useSessions, props.sessionId, cwd]);
  return { openFile, useSessions };
}

/** Resolve relative paths at their owner; never change the shared Session list. */
export function applyFileContext(ctx) {
  const inputBindings = new WeakMap();
  const decorate = (name, accepts, wrap) => ctx.effect(() => decorateSlotComponent(ctx.slots, name, accepts,
    entry => wrap(entry.component)));
  decorate('conversation.view', (_key, entry) => entry.options.id === 'chat', Original => function Chat(props) {
    const cwd = useDirectory(props);
    const actions = useFileActions(props, cwd);
    const labels = useMemo(() => ({ open: props.t('image.open'), loading: props.t('image.loading'),
      failed: props.t('image.failed'), dialog: props.t('image.dialog'), close: props.t('image.close') }), [props.t]);
    const value = useMemo(() => ({ openExternalLink: props.openExternalLink, labels }), [props.openExternalLink, labels]);
    return <FileContext.Provider value={value}><Original {...props} {...actions}/></FileContext.Provider>;
  });
  decorate('conversation.chat.node', () => true, Original => function FileNode(props) {
    const parent = useContext(FileContext);
    const cwd = useDirectory(props, props.node.anchorSeq);
    const actions = useFileActions(props, cwd, true);
    const fileImages = useMemo(() => ({ labels: parent?.labels,
      resolve: path => fileImageUrl(document.baseURI, resolveFilePath(cwd, path)) }), [parent?.labels, cwd]);
    const value = useMemo(() => ({ ...parent, cwd, openFile: actions.openFile }), [parent, cwd, actions.openFile]);
    if (!parent) return <Original {...props}/>;
    return <FileContext.Provider value={value}>
      <MarkdownDelegateProvider openFile={actions.openFile} openExternalLink={parent.openExternalLink} fileImages={fileImages}>
        <Original {...props} {...actions} cwd={cwd}/>
      </MarkdownDelegateProvider>
    </FileContext.Provider>;
  });
  // Native @file nodes have their own injected opener. Keep it under the
  // enclosing message's directory, including old messages after a later cd.
  decorate('conversation.user.text.node', key => key === 'file', Original => function FileReference(props) {
    const owner = useContext(FileContext);
    return <Original {...props} {...owner?.openFile ? { openFile: owner.openFile } : {}}/>;
  });
  // The input controller is session-owned. Normalize only the native file
  // reference before its existing handler; third-party sources stay intact.
  decorate('conversation.composer.bar', () => true, Original => function Composer(props) {
    const binding = props.sessionId && ctx.sessions.binding(props.sessionId);
    useEffect(() => {
      const controller = binding && ctx.get('inputTriggers')?.sessionOf(binding.ctx);
      if (!controller) return;
      let owner = inputBindings.get(controller);
      if (!owner) {
        owner = { users: 0, active: true, original: controller.openReference };
        owner.open = function(source, reference) {
          if (owner.active && source === 'reference' && reference.appearance === 'file' && reference.ref.startsWith('@')) {
            const cwd = binding.session.projections.faceOf('workingDirectory').getSnapshot()
              ?? ctx.sessions.list.getSnapshot().byId[props.sessionId]?.cwd;
            const path = reference.ref.startsWith('@"') ? reference.ref.slice(2, -1) : reference.ref.slice(1);
            reference = { ...reference, ref: '@"' + resolveFilePath(cwd, path) + '"' };
          }
          return owner.original.call(this, source, reference);
        };
        controller.openReference = owner.open;
        inputBindings.set(controller, owner);
      }
      owner.users++;
      return () => {
        if (--owner.users === 0) {
          owner.active = false; inputBindings.delete(controller);
          if (controller.openReference === owner.open) controller.openReference = owner.original;
        }
      };
    }, [binding, props.sessionId]);
    return <Original {...props}/>;
  });
}

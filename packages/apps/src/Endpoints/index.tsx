// Copyright 2017-2024 @polkadot/apps authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { LinkOption } from '@polkadot/apps-config/endpoints/types';
import type { Group } from './types.js';

// ok, this seems to be an eslint bug, this _is_ a package import
import punycode from 'punycode/';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import store from 'store';

import { createWsEndpoints, CUSTOM_ENDPOINT_KEY } from '@polkadot/apps-config';
import { Button, Input, Sidebar, styled } from '@polkadot/react-components';
import { useApi } from '@polkadot/react-hooks';
import { settings } from '@polkadot/ui-settings';
import { isAscii } from '@polkadot/util';

import config from '../../../apps-config/src/variables/config.js';
import { useTranslation } from '../translate.js';
import GroupDisplay from './Group.js';

interface Props {
  className?: string;
  offset?: number | string;
  onClose: () => void;
}

interface UrlState {
  apiUrl: string;
  groupIndex: number;
  hasUrlChanged: boolean;
  isUrlValid: boolean;
}

interface LcUrlState {
  lcUrl: string;
  hasLcUrlChanged: boolean;
  isLcUrlValid: boolean;
}

const STORAGE_AFFINITIES = 'network:affinities';

function isValidUrl (url: string): boolean {
  return (
    // some random length... we probably want to parse via some lib
    (url.length >= 7) &&
    // check that it starts with a valid ws identifier
    (url.startsWith('ws://') || url.startsWith('wss://') || url.startsWith('light://'))
  );
}

function isValidHttpUrl (url: string): boolean {
  return (
    // some random length... we probably want to parse via some lib
    (url.length >= 7) &&
    // check that it starts with a valid ws identifier
    (url.startsWith('http://') || url.startsWith('https://'))
  );
}

function combineEndpoints (endpoints: LinkOption[]): Group[] {
  return endpoints.reduce((result: Group[], e): Group[] => {
    if (e.isHeader) {
      result.push({ header: e.text, isDevelopment: e.isDevelopment, isSpaced: e.isSpaced, networks: [] });
    } else {
      const prev = result[result.length - 1];
      const prov = { isLightClient: e.isLightClient, name: e.textBy, url: e.value };

      if (prev.networks[prev.networks.length - 1] && e.text === prev.networks[prev.networks.length - 1].name) {
        prev.networks[prev.networks.length - 1].providers.push(prov);
      } else if (!e.isUnreachable) {
        prev.networks.push({
          isChild: e.isChild,
          isRelay: !!e.genesisHash,
          name: e.text as string,
          nameRelay: e.textRelay as string,
          paraId: e.paraId,
          providers: [prov],
          ui: e.ui
        });
      }
    }

    return result;
  }, []);
}

function getCustomEndpoints (): string[] {
  try {
    const storedAsset = localStorage.getItem(CUSTOM_ENDPOINT_KEY);

    if (storedAsset) {
      return JSON.parse(storedAsset) as string[];
    }
  } catch (e) {
    console.error(e);
    // ignore error
  }

  return [];
}

function extractUrlState (apiUrl: string, groups: Group[]): UrlState {
  let groupIndex = groups.findIndex(({ networks }) =>
    networks.some(({ providers }) =>
      providers.some(({ url }) => url === apiUrl)
    )
  );

  if (groupIndex === -1) {
    groupIndex = groups.findIndex(({ isDevelopment }) => isDevelopment);
  }

  return {
    apiUrl,
    groupIndex,
    hasUrlChanged: settings.get().apiUrl !== apiUrl,
    isUrlValid: isValidUrl(apiUrl)
  };
}

function extractLcUrlState (lcUrl: string | null, groups: Group[]): LcUrlState {
  let lcGroupIndex = groups.findIndex(({ networks }) =>
    networks.some(({ providers }) =>
      providers.some(({ url }) => url === lcUrl)
    )
  );

  if (lcGroupIndex === -1) {
    lcGroupIndex = groups.findIndex(({ isDevelopment }) => isDevelopment);
  }

  if (lcUrl === null) {
    const lcU = `${config.LCURL}/json-rpc`;

    lcUrl = lcU;
  }

  return {
    hasLcUrlChanged: window.localStorage.getItem('lcUrl') !== lcUrl,
    isLcUrlValid: isValidHttpUrl(lcUrl),
    lcUrl
  };
}

function loadAffinities (groups: Group[]): Record<string, string> {
  return Object
    .entries<string>(store.get(STORAGE_AFFINITIES) as Record<string, string> || {})
    .filter(([network, apiUrl]) =>
      groups.some(({ networks }) =>
        networks.some(({ name, providers }) =>
          name === network && providers.some(({ url }) => url === apiUrl)
        )
      )
    )
    .reduce((result: Record<string, string>, [network, apiUrl]): Record<string, string> => ({
      ...result,
      [network]: apiUrl
    }), {});
}

function isSwitchDisabled (hasUrlChanged: boolean, apiUrl: string, isUrlValid: boolean, isLocalFork?: boolean): boolean {
  if (!hasUrlChanged) {
    if (isLocalFork) {
      return false;
    } else {
      return true;
    }
  } else if (apiUrl.startsWith('light://')) {
    return false;
  } else if (isUrlValid) {
    return false;
  }

  return true;
}

function Endpoints ({ className = '', offset, onClose }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const linkOptions = createWsEndpoints(t);
  const { isLocalFork } = useApi();
  const [groups, setGroups] = useState(() => combineEndpoints(linkOptions));
  const [{ apiUrl, groupIndex, hasUrlChanged, isUrlValid }, setApiUrl] = useState<UrlState>(() => extractUrlState(settings.get().apiUrl, groups));
  const [{ hasLcUrlChanged, isLcUrlValid, lcUrl }, setLcUrl] = useState<LcUrlState>(() => extractLcUrlState(window.localStorage.getItem('lcUrl'), groups));
  const [storedCustomEndpoints, setStoredCustomEndpoints] = useState<string[]>(() => getCustomEndpoints());
  const [affinities, setAffinities] = useState(() => loadAffinities(groups));
  const sidebarRef = useRef<HTMLDivElement>(null);

  const isKnownUrl = useMemo(() => {
    let result = false;

    linkOptions.some((endpoint) => {
      if (endpoint.value === apiUrl) {
        result = true;

        return true;
      }

      return false;
    });

    return result;
  }, [apiUrl, linkOptions]);

  const isSavedCustomEndpoint = useMemo(() => {
    let result = false;

    storedCustomEndpoints.some((endpoint) => {
      if (endpoint === apiUrl) {
        result = true;

        return true;
      }

      return false;
    });

    return result;
  }, [apiUrl, storedCustomEndpoints]);

  const _changeGroup = useCallback(
    (groupIndex: number) => setApiUrl((state) => ({ ...state, groupIndex })),
    []
  );

  const _removeApiEndpoint = useCallback(
    (): void => {
      if (!isSavedCustomEndpoint) {
        return;
      }

      const newStoredCurstomEndpoints = storedCustomEndpoints.filter((url) => url !== apiUrl);

      try {
        localStorage.setItem(CUSTOM_ENDPOINT_KEY, JSON.stringify(newStoredCurstomEndpoints));
        setGroups(combineEndpoints(createWsEndpoints(t)));
        setStoredCustomEndpoints(getCustomEndpoints());
      } catch (e) {
        console.error(e);
        // ignore error
      }
    },
    [apiUrl, isSavedCustomEndpoint, storedCustomEndpoints, t]
  );

  const _setApiUrl = useCallback(
    (network: string, apiUrl: string): void => {
      setAffinities((affinities): Record<string, string> => {
        const newValue = { ...affinities, [network]: apiUrl };

        store.set(STORAGE_AFFINITIES, newValue);

        return newValue;
      });
      setApiUrl(extractUrlState(apiUrl, groups));
    },
    [groups]
  );

  const _onChangeCustom = useCallback(
    (apiUrl: string): void => {
      if (!isAscii(apiUrl)) {
        apiUrl = punycode.toASCII(apiUrl);
      }

      setApiUrl(extractUrlState(apiUrl, groups));
    },
    [groups]
  );

  const _onApply = useCallback(
    (): void => {
      store.set('localFork', '');
      settings.set({ ...(settings.get()), apiUrl });
      window.location.assign(`${window.location.origin}${window.location.pathname}?rpc=${encodeURIComponent(apiUrl)}${window.location.hash}`);

      if (!hasUrlChanged) {
        window.location.reload();
      }

      onClose();
    },
    [apiUrl, onClose, hasUrlChanged]
  );

  const _onLocalFork = useCallback(
    (): void => {
      store.set('localFork', apiUrl);
      settings.set({ ...(settings.get()), apiUrl });
      window.location.assign(`${window.location.origin}${window.location.pathname}?rpc=${encodeURIComponent(apiUrl)}${window.location.hash}`);

      if (!hasUrlChanged) {
        window.location.reload();
      }

      onClose();
    },
    [apiUrl, onClose, hasUrlChanged]
  );

  const _saveApiEndpoint = useCallback(
    (): void => {
      try {
        localStorage.setItem(CUSTOM_ENDPOINT_KEY, JSON.stringify([...storedCustomEndpoints, apiUrl]));
        _onApply();
      } catch (e) {
        console.error(e);
        // ignore error
      }
    },
    [_onApply, apiUrl, storedCustomEndpoints]
  );

  const canSwitch = useMemo(
    () => isSwitchDisabled(hasUrlChanged, apiUrl, isUrlValid, isLocalFork),
    [hasUrlChanged, apiUrl, isUrlValid, isLocalFork]
  );

  const canLCSwitch = useMemo(
    () => isSwitchDisabled(hasLcUrlChanged, lcUrl, isLcUrlValid),
    [hasLcUrlChanged, lcUrl, isLcUrlValid]
  );

  const _onChangeCustomLC = useCallback(
    (lcUrl: string): void => {
      if (!isAscii(lcUrl)) {
        lcUrl = punycode.toASCII(lcUrl);
      }

      setLcUrl(extractLcUrlState(lcUrl, groups));
    },
    [groups]
  );

  const _onLcApply = useCallback(
    (): void => {
      window.localStorage.setItem('lcUrl', lcUrl);

      window.location.assign(`${window.location.origin}${window.location.pathname}?light=${encodeURIComponent(lcUrl)}${window.location.hash}`);
      // window.location.reload();

      onClose();
    },
    [lcUrl, onClose]
  );

  return (
    <StyledSidebar
      buttons={
        <>
          <Button
            icon='sync'
            isDisabled={canSwitch}
            label={t('Switch')}
            onClick={_onApply}
          />
          <Button
            icon='sync'
            isDisabled={canLCSwitch}
            label={t('Switch LC')}
            onClick={_onLcApply}
          />
        </>
      }
      className={className}
      offset={offset}
      onClose={onClose}
      position='left'
      sidebarRef={sidebarRef}
    >
      {groups.map((group, index): React.ReactNode => (
        <GroupDisplay
          affinities={affinities}
          apiUrl={apiUrl}
          index={index}
          isSelected={groupIndex === index}
          key={index}
          setApiUrl={_setApiUrl}
          setGroup={_changeGroup}
          value={group}
        >
          {group.isDevelopment && (
            <div className='endpointCustomWrapper'>
              <Input
                className='endpointCustom'
                isError={!isUrlValid}
                isFull
                label={t('custom endpoint')}
                onChange={_onChangeCustom}
                value={apiUrl}
              />
              {isSavedCustomEndpoint
                ? (
                  <Button
                    className='customButton'
                    icon='trash-alt'
                    onClick={_removeApiEndpoint}
                  />
                )
                : (
                  <Button
                    className='customButton'
                    icon='save'
                    isDisabled={!isUrlValid || isKnownUrl}
                    onClick={_saveApiEndpoint}
                  />
                )
              }
            </div>
          )}
        </GroupDisplay>
      ))}
      <div className='endpointCustomWrapper'>
        <Input
          className='endpointCustom'
          isError={!isLcUrlValid}
          isFull
          label={t('light client endpoint')}
          onChange={_onChangeCustomLC}
          value={lcUrl}
        />
      </div>
    </StyledSidebar>
  );
}

const StyledSidebar = styled(Sidebar)`
  color: var(--color-text);
  padding-top: 3.5rem;

  .customButton {
    position: absolute;
    top: 1rem;
    right: 1rem;
  }

  .endpointCustom {
    input {
      padding-right: 4rem;
    }
  }

  .endpointCustomWrapper {
    position: relative;
  }
`;

export default React.memo(Endpoints);

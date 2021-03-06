import {_Window} from 'openfin/_v2/api/window/window';
import {WindowOption} from 'openfin/_v2/api/window/windowOption';
import {ChannelClient} from 'openfin/_v2/api/interappbus/channel/client';
import {injectable} from 'inversify';

import {Application} from '../../client/main';
import {RESOLVER_IDENTITY} from '../utils/constants';
import {Intent} from '../intents';

import {AsyncInit} from './AsyncInit';

const RESOLVER_URL = (() => {
    let providerLocation = window.location.href;

    if (providerLocation.startsWith('http://localhost')) {
        // Work-around for fake provider used within test runner
        providerLocation = providerLocation.replace('/test', '/provider');
    }

    // Locate the default resolver HTML page, relative to the location of the provider
    return providerLocation.replace('provider.html', 'ui/resolver');
})();

/**
 * Data passed to app resolver when it is invoked by the provider
 */
export interface ResolverArgs {
    intent: Intent;
    applications: Application[];
}

/**
 * Data returned by app resolver when the user has made a selection
 */
export interface ResolverResult {
    app: Application;
}

export interface ResolverHandlerBinding {
    initialized: Promise<void>;

    handleIntent(intent: Intent, apps: Application[]): Promise<ResolverResult>;
    cancel(): Promise<void>;
}

@injectable()
export class ResolverHandler extends AsyncInit implements ResolverHandlerBinding {
    private _window!: _Window;
    private _channel!: ChannelClient;

    /**
     * Instructs the resolver to prepare for a new intent.
     *
     * Resolver should refresh it's UI, and then show itself when ready.
     *
     * @param intent Intent that is about to be resolved
     * @param applications The applications to present in the resolver
     */
    public async handleIntent(intent: Intent, applications: Application[]): Promise<ResolverResult> {
        const msg: ResolverArgs = {intent, applications};

        await this._window.show();
        await this._window.setAsForeground();
        const selection: ResolverResult = await this._channel.dispatch('resolve', msg).catch(console.error);
        await this._window.hide();

        return selection;
    }

    /**
     * Instructs the resolver to hide itself.
     *
     * The resolver will be re-used if another intent needs to be resolved later. If there are queued intents, this
     * could be immediately after the resolver is done cleaning-up.
     */
    public cancel(): Promise<void> {
        return this._window.hide();
    }

    /**
     * Performs one-off initialisation
     */
    protected async init(): Promise<void> {
        const options: WindowOption = {
            url: RESOLVER_URL,
            name: RESOLVER_IDENTITY.name,
            alwaysOnTop: true,
            autoShow: false,
            contextMenu: !(process.env.NODE_ENV === 'production'),
            showTaskbarIcon: false,
            saveWindowState: false,
            defaultCentered: true,
            frame: false,
            resizable: false,
            defaultWidth: 242,
            defaultHeight: 444
        };

        // Close any existing resolver window (in case service is restarted)
        await fin.Window.wrapSync(RESOLVER_IDENTITY).close(true).catch(() => {});

        // Create resolver
        this._window = await fin.Window.create(options);
        this._window.addListener('close-requested', () => false);
        this._channel = await fin.InterApplicationBus.Channel.connect('resolver');
    }
}

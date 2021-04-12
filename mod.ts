import {
  SlashCommandsManager,
  SlashClient,
  SlashCommandHandlerCallback,
  SlashCommandHandler
} from './src/interactions/mod.ts'
import { InteractionResponseType, InteractionType } from './src/types/slash.ts'

export interface DeploySlashInitOptions {
  env?: boolean
  publicKey?: string
  token?: string
  id?: string
}

let client: SlashClient
let commands: SlashCommandsManager

export function init(options: DeploySlashInitOptions): void {
  if (client !== undefined) throw new Error('Already initialized')
  if (options.env === true) {
    options.publicKey = Deno.env.get('PUBLIC_KEY')
    options.token = Deno.env.get('TOKEN')
    options.id = Deno.env.get('ID')
  }

  if (options.publicKey === undefined)
    throw new Error('Public Key not provided')

  client = new SlashClient({
    id: options.id,
    token: options.token,
    publicKey: options.publicKey
  })

  commands = client.commands

  const cb = async (evt: {
    respondWith: CallableFunction
    request: Request
  }): Promise<void> => {
    try {
      const d = await client.verifyFetchEvent({
        respondWith: (...args: any[]) => evt.respondWith(...args),
        request: evt.request
      })
      if (d === false) {
        await evt.respondWith(
          new Response('Not Authorized', {
            status: 400
          })
        )
        return
      }

      if (d.type === InteractionType.PING) {
        await d.respond({ type: InteractionResponseType.PONG })
        client.emit('ping')
        return
      }

      await (client as any)._process(d)
    } catch (e) {
      await client.emit('interactionError', e)
    }
  }

  addEventListener('fetch', cb as any)
}

export function handle(
  cmd: string | SlashCommandHandler,
  handler?: SlashCommandHandlerCallback
): void {
  client.handle(cmd, handler)
}

// Hacky workaround. Timers don't exist in Deploy runtime :(

if (typeof (window as any).setTimeout !== 'function') {
  Object.defineProperty(window, 'setTimeout', {
    value: (fn: CallableFunction, _ms: number, ...args: any[]) => {
      fn(...args)
      return 0
    }
  })
}

if (typeof (window as any).clearTimeout !== 'function') {
  Object.defineProperty(window, 'clearTimeout', {
    value: (_id: number) => {}
  })
}

export { commands, client }
export * from './src/types/slash.ts'
export * from './src/structures/slash.ts'
export * from './src/interactions/mod.ts'
export * from './src/types/channel.ts';

// Pick up TOKEN and PUBLIC_KEY from ENV.
slash.init({ env: true });

const ACTIVITIES: {
  [name: string]: {
    id: string;
    name: string;
  };
} = {
  poker: {
    id: "755827207812677713",
    name: "Poker Night",
  },
  betrayal: {
    id: "773336526917861400",
    name: "Betrayal.io",
  },
  youtube: {
    id: "755600276941176913",
    name: "YouTube Together",
  },
  fishing: {
    id: "814288819477020702",
    name: "Fishington.io",
  },
};

// Create Slash Commands if not present
slash.commands.all().then((e) => {
  if (e.size !== 2) {
    slash.commands.bulkEdit([
      {
        name: "invite",
        description: "Invite me to your server.",
      },
      {
        name: "activity",
        description: "Start an Activity in a Voice Channel.",
        options: [
          {
            name: "channel",
            type: slash.SlashCommandOptionType.CHANNEL,
            description: "Voice Channel to start activity in.",
            required: true,
          },
          {
            name: "activity",
            type: slash.SlashCommandOptionType.STRING,
            description: "Activity to start.",
            required: true,
            choices: Object.entries(ACTIVITIES).map((e) => ({
              name: e[1].name,
              value: e[0],
            })),
          },
        ],
      },
    ]);
  }
});

slash.handle("activity", (d) => {
  if (!d.guild) return;
  const channel = d.option<slash.InteractionChannel>("channel");
  const activity = ACTIVITIES[d.option<string>("activity")];
  if (!channel || !activity) {
    return d.reply("Invalid interaction.", { ephemeral: true });
  }
  if (channel.type !== slash.ChannelTypes.GUILD_VOICE) {
    return d.reply("Activities can only be started in Voice Channels.", {
      ephemeral: true,
    });
  }

  slash.client.rest.api.channels[channel.id].invites
    .post({
      max_age: 604800,
      max_uses: 0,
      target_application_id: activity.id,
      target_type: 2,
      temporary: false,
    })
    .then((inv) => {
      d.reply(
        `[Click here to start ${activity.name} in ${channel.name}.](<https://discord.gg/${inv.code}>)`
      );
    })
    .catch((e) => {
      console.log("Failed", e);
      d.reply("Failed to start Activity.", { ephemeral: true });
    });
});

slash.handle("invite", (d) => {
  d.reply(
    `• [Click here to invite.](<https://discord.com/api/oauth2/authorize?client_id=819835984388030464&permissions=1&scope=applications.commands%20bot>)\n` +
      `• [Check out Source Code.](<https://github.com/DjDeveloperr/ActivitiesBot>)\n` +
      `• [Join our Discord.](<https://discord.gg/WVN2JF2FRv>)`,
    { ephemeral: true }
  );
});

slash.handle("*", (d) => d.reply("Unhandled Command", { ephemeral: true }));
slash.client.on("interactionError", console.log);

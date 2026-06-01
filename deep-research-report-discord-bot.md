# Core Architecture & Performance

- **Sharding vs. Clustering:**  Discord forces sharding once a bot joins ≥2,500 guilds【22†L69-L77】.  In practice, aim for ~1,000–2,000 servers per shard; beyond that, spawn more shards using Discord.js’s `ShardingManager` or internal sharding.  If a single process exhausts CPU or memory, use **cluster processes** to spread load.  A common rule is ~3–5 shards per Node process (cluster) to balance throughput.  For very large bots, run multiple machines each hosting some clusters/shards.  Solutions like *discord-hybrid-sharding* or *galactic.ts* can coordinate shards across hosts【24†L282-L290】【17†L64-L73】.  Always use Discord’s REST API for writes and only use the gateway for receiving events【47†L770-L778】 (sending messages via HTTP reduces rate-limit pressure).  Plan for zero-downtime restarts: for example, use a clustered manager that respawns dead workers and allows reclustering without taking the bot offline【17†L64-L73】【24†L282-L290】.

- **Advanced Caching:**  Minimize API and DB hits with layered caching.  At the **local level**, use in-memory caches with size limits or LRU eviction for frequently accessed data (e.g. per-shard configuration, recent user state).  Discord.js itself lets you limit cache sizes (for messages, members, presences, etc.) and sweep old entries【13†L90-L99】.  At the **distributed level**, use a fast store like Redis.  For example, cache guild settings or rate-limit windows in Redis so all shards see a shared state; use Redis Pub/Sub to invalidate caches across shards in <100ms when data changes【11†L33-L41】.  One case study showed Redis caching reduced DB ops by 94% (6,000→365 per 1,000 messages) and cut a 50ms XP-calculation down to sub-millisecond【11†L45-L49】.  Use TTLs on cache entries to prevent stale growth, and design fallbacks if Redis is unavailable.  (As a micro-optimization, you can even cache hot global references like `const { floor: mathFloor } = Math` at module top to reduce lookup overhead.)  

- **Low-Latency & Event Loop:**  Aim to keep command latency under ~50ms.  Write fully asynchronous code so nothing blocks the Node event loop【13†L125-L133】.  Avoid any synchronous I/O (don’t use `fs.readFileSync` or CPU-heavy loops in the main thread).  Offload heavy tasks (image processing, crypto, etc.) to worker threads or external microservices.  Monitor event-loop lag and memory usage (for example, log `process.memoryUsage()` every few minutes) to catch slowdowns or leaks【13†L65-L73】.  Watch for memory leaks: common culprits include unbounded collections or caches growing indefinitely, forgotten event listeners, or timers (`setInterval`) not cleared【13†L49-L58】.  Use cache limits and sweepers to trim old data【13†L90-L99】.  For database and I/O, use efficient batching and pooling: batch multiple API calls together, and use a connection pool (most Node SQL/ORM libraries do this)【14†L207-L211】.  Index your database on common query fields (e.g. `CREATE INDEX ON table(user_id)`) so lookups stay fast【14†L199-L207】.  In summary, profile your code (Node’s `--inspect`, flamegraphs, or APM tools) and “fix code before upgrading hosting” – even large VPS won’t save an inefficient bot【13†L35-L44】【14†L227-L235】.

# Feature Handling & Interaction Flow

- **Slash Commands, Context Menus & Components:**  Use modern *application commands* for all new features: slash (chat-input) commands, user-context and message-context commands.  Avoid old-style text prefixes except for legacy needs【47†L987-L995】.  Register commands in code or via REST once (e.g. using `rest.put(Routes.applicationCommands(...))`) so Discord handles autocomplete, descriptions, and permissions.  For interactive UI elements, use Message Components (buttons, select menus) and Modals.  Every interaction must be acknowledged within 3 seconds【30†L44-L48】; for slash commands that do non-trivial work, immediately call `await interaction.deferReply()` or `interaction.deferUpdate()` (for components) and then `editReply()` when done【51†L182-L189】【13†L163-L170】.  This “thinking” response prevents gateway timeouts.  Design workflows carefully: for example, use `awaitMessageComponent()` or collectors to handle sequential button responses (with filters so only the invoking user can click)【48†L128-L136】.  Prefer **ephemeral** replies for confirmations or private info.  

- **Concurrency & Deferring:**  Node can handle many in-flight promises simultaneously, so no need to globally lock for each command.  Instead, ensure shared resources (DB, files) are used safely (e.g. transactions or Redis locks if needed).  For each interaction, do not do blocking waits – use `async/await`.  If two identical slash commands are triggered in quick succession, don’t reuse a single reply object: instead, `deferReply()` each call independently【51†L182-L189】.  Set sensible timeouts on any long operations, so they can fail gracefully (e.g. database queries or external API calls).  

- **Rate Limits & Queuing:**  Discord enforces strict per-route and global rate limits【30†L39-L48】.  Discord.js (and most libs) auto-queues requests per route, but heavy bots should build robust back-pressure.  Batch or throttle repetitive tasks.  For example, don’t `await channel.send()` 100 times in a tight loop – instead insert small delays or use a queue, e.g.: 
  ```js
  for (let msg of messages) {
    await channel.send(msg);
    await new Promise(r => setTimeout(r, 100)); // 100ms pause
  }
  ``` 
  Such pacing avoids global 50req/s bursts.  If a 429 is received, implement **exponential backoff** using the `Retry-After` header【47†L848-L857】.  A simple pattern is:
  ```js
  async function requestWithRetry(fn, retries=5) {
    try { return await fn(); }
    catch (err) {
      if (err.status===429 && retries>0) {
        const wait = (err.headers.get('Retry-After')||1)*1000;
        await new Promise(r => setTimeout(r, wait + Math.random()*500));
        return requestWithRetry(fn, retries-1);
      }
      throw err;
    }
  }
  ```
  Always log or emit “rateLimit” events so you can monitor throttling【30†L63-L72】.  Avoid raw HTTP loops that flood the API.  In short, treat every bulk action with a queue or scheduler, and respect Discord’s guidance: “discord.js and discord.py handle these automatically… [but] if you call the API directly you must respect them yourself”【30†L125-L134】.

# Do’s and Don’ts (Anti-Patterns)

- **Anti-Patterns:**  **Don’t** put all logic in one file – structure the bot modularly【9†L1050-L1058】【54†L169-L178】. Avoid “prefix command spaghetti”; favor organized slash-command handlers【47†L987-L995】【54†L169-L178】.  **Don’t** let caches or arrays grow unbounded (e.g. logging every message in an array will eventually OOM)【13†L49-L58】. **Don’t** use blocking calls on the event loop (no `sleep()` or sync disk I/O). **Don’t** ignore promise rejections or throw errors without catching them – uncaught errors should not crash the bot. (Use global error handlers – see below.) **Don’t** attempt operations through the gateway opcodes (e.g. sending messages via raw gateway) instead of REST【47†L770-L778】. **Don’t** hard-code tokens, secrets, or privileged intent flags in code【47†L919-L928】【45†L110-L119】. **Don’t** request more intents or permissions than needed – this not only wastes resources but can trigger verification scrutiny【47†L940-L949】.

- **Gateway Intents & Permissions:**  Only enable the specific Gateway Intents your bot needs【47†L940-L949】. For a simple command bot, this is typically just `GUILDS` and maybe `GUILD_MESSAGES`. Avoid privileged intents like `GUILD_MEMBERS` or `MESSAGE_CONTENT` unless absolutely required (and apply for them formally)【47†L940-L949】. Lower intents means less data caching and lower CPU/memory overhead.  Also, when adding the bot to servers, scope its OAuth to minimal scopes (usually just `bot` and `applications.commands`), and give the bot only the Discord permissions it truly needs (e.g. “Manage Messages” only if you need to delete, etc). On the system side, run the bot under a locked-down account and do not expose its config/token.

- **Security:**  Never log or expose your bot token or secrets【47†L919-L928】【45†L110-L119】. Store secrets in environment variables or a secure manager (Docker secrets, Vault, etc)【47†L919-L928】. Use a logging framework that redacts sensitive data. Be careful with user data: avoid storing or logging full message content or personal info unless absolutely needed (and comply with privacy standards). Use up-to-date libraries to benefit from security fixes. Finally, run the bot behind a reverse proxy or firewall if possible, and keep dependencies patched.

# Advanced Tricks & Modular Design

- **Codebase Structure:**  Adopt a clear directory layout. For example:  
  ```
  src/
    commands/      # each slash command module
    events/        # event handlers (ready.js, interactionCreate.js, etc.)
    components/    # buttons/select handlers or collectors (optional)
    config/        # config or constants (e.g. intents, prefixes, etc.)
    services/      # external services (database, API clients)
    utils/         # utility functions
  ```
  In your main entry point, simply iterate through `commands/` and `events/` to register them with the Discord client【9†L1050-L1058】.  This keeps code maintainable and testable. Example snippet:
  ```js
  // bot.js (entry)
  const client = new Client({ intents: [...] });
  const commands = loadCommands(__dirname+'/commands');
  const events = loadEvents(__dirname+'/events');
  client.login(process.env.DISCORD_BOT_TOKEN);
  ```
  Here `loadCommands` can automatically register each command file with the application commands registry, and `loadEvents` attaches `.on('interactionCreate',…)` handlers. Such modular design (separate files for each command/event) improves readability【9†L1050-L1058】【54†L169-L178】.

- **Database & Pooling:**  High-throughput bots must treat the database efficiently. Use a database connection **pool** (built-in to ORMs like Prisma, Sequelize, or drivers like `mysql2/promise`), so you’re not opening a new TCP connection on every query【14†L207-L211】. Index any columns you frequently filter by (e.g. `user_id`, `guild_id`) to speed lookups【14†L199-L207】. Only SELECT the fields you need – avoid `SELECT *` if you only use some columns【14†L215-L222】. For very high write loads (e.g. leveling system), consider an in-memory cache (Redis) for the hot path and flush to DB asynchronously (like the “session-based” XP caching pattern)【11†L33-L41】. Use batched or bulk operations when possible (for example, updating many user points in one SQL query instead of many single updates).  

- **Error Handling & Logging:**  Implement *global error handlers* to prevent crashes: e.g. 
  ```js
  process.on('unhandledRejection', err => {
    console.error('Unhandled promise rejection:', err);
    // report to external monitoring, but do NOT exit process
  });
  process.on('uncaughtException', err => {
    console.error('Uncaught exception:', err);
    // consider exiting or restarting after logging
  });
  client.on('error', err => console.error('Client error:', err));
  client.on('shardError', (err, shardId) => console.error(`Shard ${shardId} error:`, err));
  ```
  Also wrap command execution in a try/catch so one bad command doesn’t crash the bot【45†L59-L68】. For example:
  ```js
  client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    try {
      await commands.get(interaction.commandName).execute(interaction);
    } catch (err) {
      console.error(`Error in /${interaction.commandName}:`, err);
      const msg = { content: 'An error occurred, please try again.', ephemeral: true };
      if (interaction.replied || interaction.deferred) 
        await interaction.followUp(msg).catch(() => {});
      else 
        await interaction.reply(msg).catch(() => {});
    }
  });
  ```
  For logging, use a structured logger (e.g. [Winston](https://github.com/winstonjs/winston)).  Log important events (startup/shutdown, command usage, rate limits hit, errors with context, shard reconnects) with timestamps and metadata【45†L104-L113】.  Never log secrets, tokens, or full message contents【45†L110-L119】. Rotate logs daily or size-limit them to avoid disk bloat.  In production, run the bot under a process manager (like PM2 or Docker with a restart policy) so it auto-restarts on crashes【45†L183-L191】.  You can also emit periodic “heartbeat” logs (memory usage, ping, uptime) to detect slow memory leaks or latency spikes【45†L142-L150】.  

In summary, design your bot as an efficient distributed system: **modular code**, **asynchronous event-driven flow**, **intelligent caching and batching**, and **robust error and rate-limit handling**.  This ensures your bot remains responsive (sub-50ms per request where feasible), scalable across CPU and machines, and stable under heavy load【11†L33-L41】【30†L74-L83】.

**Sources:** Official Discord docs and community best practices【22†L69-L77】【47†L848-L857】【47†L919-L928】【47†L940-L949】【47†L987-L995】; performance guides【13†L49-L58】【14†L207-L222】【45†L32-L41】【30†L44-L48】; real-world case studies【11†L33-L41】【30†L74-L83】.
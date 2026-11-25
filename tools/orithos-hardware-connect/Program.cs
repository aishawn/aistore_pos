using Orithos.HardwareConnect;

SupportLog.Initialize();
SupportLog.Record("info", "client.process-started");
Environment.ExitCode = AgentHost.Run(args);

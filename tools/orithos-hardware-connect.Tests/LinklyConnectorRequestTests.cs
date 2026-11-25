using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class LinklyConnectorRequestTests
{
    [Theory]
    [InlineData("/v1/purchase", "{invalid-json")]
    [InlineData("/v1/query", "{\"attemptId\":\"not-a-number\",\"connectorChallenge\":\"x\"}")]
    [InlineData("/v1/purchase", "{\"attemptId\":0,\"connectorChallenge\":\"x\"}")]
    public async Task RejectsInvalidTransactionRequestsAsBadRequest(string path, string body)
    {
        using var host = await RunningConnectorHost.StartAsync();
        using var content = new StringContent(body, Encoding.UTF8, "application/json");

        using var response = await host.Client.PostAsync(path, content);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ConnectorRejectsRequestBodiesLargerThanOneMegabyte()
    {
        using var host = await RunningConnectorHost.StartAsync();
        using var content = new StringContent(new string('x', 1_100_000), Encoding.UTF8, "application/json");

        using var response = await host.Client.PostAsync("/v1/purchase", content);

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
    }

    private sealed class RunningConnectorHost : IDisposable
    {
        private readonly CancellationTokenSource cancellation;
        private readonly Task hostTask;
        private readonly string? previousUrl;
        private readonly string? previousLinklyBase;
        private readonly string? previousAdapterBase;

        public HttpClient Client { get; }

        private RunningConnectorHost(CancellationTokenSource cancellation, Task hostTask, HttpClient client, string? previousUrl, string? previousLinklyBase, string? previousAdapterBase)
        {
            this.cancellation = cancellation;
            this.hostTask = hostTask;
            Client = client;
            this.previousUrl = previousUrl;
            this.previousLinklyBase = previousLinklyBase;
            this.previousAdapterBase = previousAdapterBase;
        }

        public static async Task<RunningConnectorHost> StartAsync()
        {
            var previousUrl = Environment.GetEnvironmentVariable("ORITHOS_CONNECTOR_URL");
            var previousLinklyBase = Environment.GetEnvironmentVariable("ORITHOS_LINKLY_TCP_BASE");
            var previousAdapterBase = Environment.GetEnvironmentVariable("ORITHOS_LINKLY_ADAPTER_BASE");
            var port = ReservePort();
            var baseAddress = $"http://127.0.0.1:{port}/";
            Environment.SetEnvironmentVariable("ORITHOS_CONNECTOR_URL", baseAddress);
            Environment.SetEnvironmentVariable("ORITHOS_LINKLY_TCP_BASE", null);
            Environment.SetEnvironmentVariable("ORITHOS_LINKLY_ADAPTER_BASE", null);
            var cancellation = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            var hostTask = RunConnectorHost(cancellation.Token);
            var client = new HttpClient { BaseAddress = new Uri(baseAddress), Timeout = TimeSpan.FromSeconds(3) };
            try
            {
                using var probe = await client.GetAsync("/v1/health");
                Assert.Equal(HttpStatusCode.OK, probe.StatusCode);
                return new RunningConnectorHost(cancellation, hostTask, client, previousUrl, previousLinklyBase, previousAdapterBase);
            }
            catch
            {
                cancellation.Cancel();
                client.Dispose();
                Environment.SetEnvironmentVariable("ORITHOS_CONNECTOR_URL", previousUrl);
                Environment.SetEnvironmentVariable("ORITHOS_LINKLY_TCP_BASE", previousLinklyBase);
                Environment.SetEnvironmentVariable("ORITHOS_LINKLY_ADAPTER_BASE", previousAdapterBase);
                throw;
            }
        }

        public void Dispose()
        {
            cancellation.Cancel();
            Client.Dispose();
            try { hostTask.Wait(TimeSpan.FromSeconds(3)); }
            catch (AggregateException) { }
            cancellation.Dispose();
            Environment.SetEnvironmentVariable("ORITHOS_CONNECTOR_URL", previousUrl);
            Environment.SetEnvironmentVariable("ORITHOS_LINKLY_TCP_BASE", previousLinklyBase);
            Environment.SetEnvironmentVariable("ORITHOS_LINKLY_ADAPTER_BASE", previousAdapterBase);
        }

        private static int ReservePort()
        {
            using var listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            return ((IPEndPoint)listener.LocalEndpoint).Port;
        }
    }

    private static Task RunConnectorHost(CancellationToken cancellationToken)
    {
        var assembly = Assembly.Load("OrithosHardwareConnect");
        var hostType = assembly.GetType("Orithos.HardwareConnect.LinklyConnectorWebApp", throwOnError: true)!;
        var run = hostType.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)
            .Single(method => method.Name == "RunAsync" && method.GetParameters().Length == 1);
        return (Task)run.Invoke(null, [cancellationToken])!;
    }
}

using System.Net;
using System.Net.Sockets;
using System.Reflection;
using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class HardwareConnectSecurityTests
{
    [Fact]
    public async Task HardwareHostRejectsNonLoopbackListenAddress()
    {
        var original = Environment.GetEnvironmentVariable("ORITHOS_HC_URL");
        using var cancellation = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        Environment.SetEnvironmentVariable("ORITHOS_HC_URL", "http://0.0.0.0:19170/");

        try
        {
            var host = RunHardwareHost(cancellation.Token);
            await Task.WhenAny(host, Task.Delay(500, CancellationToken.None));

            Assert.True(host.IsFaulted, "The hardware API must fail closed for a non-loopback bind address.");
            Assert.IsType<InvalidOperationException>(host.Exception?.GetBaseException());
        }
        finally
        {
            Environment.SetEnvironmentVariable("ORITHOS_HC_URL", original);
            cancellation.Cancel();
        }
    }

    [Fact]
    public async Task HardwareHostRejectsUnapprovedBrowserOrigin()
    {
        using var host = await RunningHardwareHost.StartAsync();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/v1/health");
        request.Headers.Add("Origin", "https://attacker.example");

        using var response = await host.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task HardwareHostAllowsConfiguredStoreOriginAndPrivateNetworkPreflight()
    {
        using var host = await RunningHardwareHost.StartAsync();
        using var request = new HttpRequestMessage(HttpMethod.Options, "/v1/printers");
        request.Headers.Add("Origin", "https://skr.orithos.com.au");
        request.Headers.Add("Access-Control-Request-Method", "GET");

        using var response = await host.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal("https://skr.orithos.com.au", response.Headers.GetValues("Access-Control-Allow-Origin").Single());
        Assert.Equal("true", response.Headers.GetValues("Access-Control-Allow-Private-Network").Single());
    }

    [Theory]
    [InlineData("{invalid-json")]
    [InlineData("{\"printer\":\"Receipt\",\"bytes\":[-1]}")]
    [InlineData("{\"printer\":\"Receipt\",\"bytes\":[256]}")]
    public async Task RawPrintRejectsMalformedJsonAndOutOfRangeBytes(string body)
    {
        using var host = await RunningHardwareHost.StartAsync();
        using var content = new StringContent(body, System.Text.Encoding.UTF8, "application/json");

        using var response = await host.Client.PostAsync("/v1/print/raw", content);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task HardwareHostRejectsRequestsLargerThanOneMegabyte()
    {
        using var host = await RunningHardwareHost.StartAsync();
        using var content = new StringContent(new string('x', 1_100_000), System.Text.Encoding.UTF8, "application/json");

        using var response = await host.Client.PostAsync("/v1/print/text", content);

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
    }

    [Fact]
    public async Task ShelfExportRejectsMalformedJsonWithoutChangingSettings()
    {
        using var host = await RunningHardwareHost.StartAsync();
        using var content = new StringContent("{invalid-json", System.Text.Encoding.UTF8, "application/json");

        using var response = await host.Client.PostAsync("/v1/shelf-export", content);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private sealed class RunningHardwareHost : IDisposable
    {
        private readonly CancellationTokenSource cancellation;
        private readonly Task hostTask;

        public HttpClient Client { get; }

        private RunningHardwareHost(CancellationTokenSource cancellation, Task hostTask, HttpClient client)
        {
            this.cancellation = cancellation;
            this.hostTask = hostTask;
            Client = client;
        }

        public static async Task<RunningHardwareHost> StartAsync()
        {
            var original = Environment.GetEnvironmentVariable("ORITHOS_HC_URL");
            var port = ReservePort();
            var baseAddress = $"http://127.0.0.1:{port}/";
            Environment.SetEnvironmentVariable("ORITHOS_HC_URL", baseAddress);
            var cancellation = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            var hostTask = RunHardwareHost(cancellation.Token);
            var client = new HttpClient { BaseAddress = new Uri(baseAddress), Timeout = TimeSpan.FromSeconds(2) };

            try
            {
                using var probe = await client.GetAsync("/v1/health");
                Assert.Equal(HttpStatusCode.OK, probe.StatusCode);
                return new RunningHardwareHost(cancellation, hostTask, client);
            }
            catch
            {
                cancellation.Cancel();
                client.Dispose();
                throw;
            }
            finally
            {
                Environment.SetEnvironmentVariable("ORITHOS_HC_URL", original);
            }
        }

        public void Dispose()
        {
            cancellation.Cancel();
            Client.Dispose();
            try
            {
                hostTask.Wait(TimeSpan.FromSeconds(3));
            }
            catch (AggregateException)
            {
            }
            cancellation.Dispose();
        }

        private static int ReservePort()
        {
            using var listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            return ((IPEndPoint)listener.LocalEndpoint).Port;
        }
    }

    private static Task RunHardwareHost(CancellationToken cancellationToken)
    {
        var assembly = Assembly.Load("OrithosHardwareConnect");
        var hostType = assembly.GetType("Orithos.HardwareConnect.HardwareConnectWebApp", throwOnError: true)!;
        var run = hostType.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)
            .Single(method => method.Name == "RunAsync" && method.GetParameters().Length == 1);
        return (Task)run.Invoke(null, [cancellationToken])!;
    }
}

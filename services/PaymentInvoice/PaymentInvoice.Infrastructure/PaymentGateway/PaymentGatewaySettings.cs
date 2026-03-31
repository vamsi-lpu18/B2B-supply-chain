namespace PaymentInvoice.Infrastructure.PaymentGateway;

public sealed class PaymentGatewaySettings
{
    public bool Enabled { get; set; }
    public string Provider { get; set; } = "Razorpay";
    public bool TestMode { get; set; } = true;
    public RazorpaySettings Razorpay { get; set; } = new();
}

public sealed class RazorpaySettings
{
    public string BaseUrl { get; set; } = "https://api.razorpay.com";
    public string KeyId { get; set; } = string.Empty;
    public string KeySecret { get; set; } = string.Empty;
    public string DefaultCurrency { get; set; } = "INR";
    public bool CapturePayments { get; set; } = true;
}

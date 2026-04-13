using IdentityAuth.Application.Abstractions;
using IdentityAuth.Application.DTOs;
using MediatR;

namespace IdentityAuth.Application.Features.Auth;

public sealed record RegisterDealerCommand(RegisterDealerRequest Request) : IRequest<RegisterDealerResponse>;

public sealed class RegisterDealerCommandHandler(IIdentityAuthService service)
    : IRequestHandler<RegisterDealerCommand, RegisterDealerResponse>
{
    public Task<RegisterDealerResponse> Handle(RegisterDealerCommand request, CancellationToken cancellationToken)
        => service.RegisterDealerAsync(request.Request, cancellationToken);
}

public sealed record CreateAgentCommand(CreateAgentRequest Request) : IRequest<CreateAgentResponse>;

public sealed class CreateAgentCommandHandler(IIdentityAuthService service)
    : IRequestHandler<CreateAgentCommand, CreateAgentResponse>
{
    public Task<CreateAgentResponse> Handle(CreateAgentCommand request, CancellationToken cancellationToken)
        => service.CreateAgentAsync(request.Request, cancellationToken);
}

public sealed record LoginCommand(LoginRequest Request) : IRequest<AuthResponse>;

public sealed class LoginCommandHandler(IIdentityAuthService service)
    : IRequestHandler<LoginCommand, AuthResponse>
{
    public Task<AuthResponse> Handle(LoginCommand request, CancellationToken cancellationToken)
        => service.LoginAsync(request.Request, cancellationToken);
}

public sealed record RefreshTokenCommand(string RefreshToken) : IRequest<AuthResponse>;

public sealed class RefreshTokenCommandHandler(IIdentityAuthService service)
    : IRequestHandler<RefreshTokenCommand, AuthResponse>
{
    public Task<AuthResponse> Handle(RefreshTokenCommand request, CancellationToken cancellationToken)
        => service.RefreshTokenAsync(request.RefreshToken, cancellationToken);
}

public sealed record ForgotPasswordCommand(ForgotPasswordRequest Request) : IRequest<Unit>;

public sealed class ForgotPasswordCommandHandler(IIdentityAuthService service)
    : IRequestHandler<ForgotPasswordCommand, Unit>
{
    public async Task<Unit> Handle(ForgotPasswordCommand request, CancellationToken cancellationToken)
    {
        await service.ForgotPasswordAsync(request.Request, cancellationToken);
        return Unit.Value;
    }
}

public sealed record ResetPasswordCommand(ResetPasswordRequest Request) : IRequest<Unit>;

public sealed class ResetPasswordCommandHandler(IIdentityAuthService service)
    : IRequestHandler<ResetPasswordCommand, Unit>
{
    public async Task<Unit> Handle(ResetPasswordCommand request, CancellationToken cancellationToken)
    {
        await service.ResetPasswordAsync(request.Request, cancellationToken);
        return Unit.Value;
    }
}

public sealed record ChangePasswordCommand(Guid UserId, ChangePasswordRequest Request) : IRequest<Unit>;

public sealed class ChangePasswordCommandHandler(IIdentityAuthService service)
    : IRequestHandler<ChangePasswordCommand, Unit>
{
    public async Task<Unit> Handle(ChangePasswordCommand request, CancellationToken cancellationToken)
    {
        await service.ChangePasswordAsync(request.UserId, request.Request, cancellationToken);
        return Unit.Value;
    }
}

public sealed record LogoutCommand(Guid UserId, string? Jti, DateTime? TokenExpiresAtUtc, string? RefreshToken)
    : IRequest<Unit>;

public sealed class LogoutCommandHandler(IIdentityAuthService service)
    : IRequestHandler<LogoutCommand, Unit>
{
    public async Task<Unit> Handle(LogoutCommand request, CancellationToken cancellationToken)
    {
        await service.LogoutAsync(
            request.UserId,
            request.Jti,
            request.TokenExpiresAtUtc,
            request.RefreshToken,
            cancellationToken);

        return Unit.Value;
    }
}

public sealed record ApproveDealerCommand(Guid DealerId) : IRequest<bool>;

public sealed class ApproveDealerCommandHandler(IIdentityAuthService service)
    : IRequestHandler<ApproveDealerCommand, bool>
{
    public Task<bool> Handle(ApproveDealerCommand request, CancellationToken cancellationToken)
        => service.ApproveDealerAsync(request.DealerId, cancellationToken);
}

public sealed record RejectDealerCommand(Guid DealerId, string Reason) : IRequest<bool>;

public sealed class RejectDealerCommandHandler(IIdentityAuthService service)
    : IRequestHandler<RejectDealerCommand, bool>
{
    public Task<bool> Handle(RejectDealerCommand request, CancellationToken cancellationToken)
        => service.RejectDealerAsync(request.DealerId, request.Reason, cancellationToken);
}

public sealed record UpdateCreditLimitCommand(Guid DealerId, decimal CreditLimit)
    : IRequest<CreditLimitUpdateResult>;

public sealed class UpdateCreditLimitCommandHandler(IIdentityAuthService service)
    : IRequestHandler<UpdateCreditLimitCommand, CreditLimitUpdateResult>
{
    public Task<CreditLimitUpdateResult> Handle(UpdateCreditLimitCommand request, CancellationToken cancellationToken)
        => service.UpdateCreditLimitAsync(request.DealerId, request.CreditLimit, cancellationToken);
}

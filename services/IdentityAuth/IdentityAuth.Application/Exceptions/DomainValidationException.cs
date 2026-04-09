namespace IdentityAuth.Application.Exceptions;

public sealed class DomainValidationException(string message) : Exception(message);

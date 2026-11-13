"""Secure local link: the same app over https on the Wi-Fi, so phone browsers allow the microphone.

Phone browsers block the microphone on plain http:// addresses (except localhost). The server therefore also listens
on https://<LAN IP>:8443 with a self-signed certificate made on this computer. The first time, each phone shows a
"not private" warning; tapping Advanced -> Proceed (Android) or Show Details -> visit this website (iPhone) opens the
app and the microphone works. Both ports serve one app in one process, so live updates reach every screen.
Set AWAAZ_HTTPS=0 to switch it off; AWAAZ_HTTPS_PORT changes the port.
"""
import asyncio
import datetime as dt
import ipaddress
import logging
import os
from contextlib import nullcontext
from pathlib import Path

from . import config

PORT = int(os.getenv("AWAAZ_HTTPS_PORT", "8443"))
log = logging.getLogger("awaaz.tls")
state = {"running": False, "error": None}
_server = None


def enabled() -> bool:
    return os.getenv("AWAAZ_HTTPS", "1") != "0"


def _paths() -> tuple[Path, Path]:
    d = config.VAR / "tls"
    d.mkdir(parents=True, exist_ok=True)
    return d / "cert.pem", d / "key.pem"


def ensure_cert(ip: str) -> tuple[Path, Path]:
    """Self-signed certificate for localhost and this computer's Wi-Fi address; remade when the address changes."""
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import NameOID

    cert_p, key_p = _paths()
    if cert_p.exists() and key_p.exists():
        try:
            c = x509.load_pem_x509_certificate(cert_p.read_bytes())
            ips = c.extensions.get_extension_for_class(x509.SubjectAlternativeName).value.get_values_for_type(x509.IPAddress)
            if ipaddress.ip_address(ip) in ips and c.not_valid_after_utc > dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=7):
                return cert_p, key_p
        except Exception:  # noqa: BLE001 - any problem: make a new one
            pass
    key = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "AwaazSaathi demo (local)")])
    now = dt.datetime.now(dt.timezone.utc)
    alt = [x509.DNSName("localhost"), x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]
    if ip != "127.0.0.1":
        alt.append(x509.IPAddress(ipaddress.ip_address(ip)))
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now - dt.timedelta(days=1))
            .not_valid_after(now + dt.timedelta(days=397))
            .add_extension(x509.SubjectAlternativeName(alt), critical=False)
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .sign(key, hashes.SHA256()))
    key_p.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    cert_p.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    return cert_p, key_p


async def serve(app, ip: str) -> None:
    """Runs a second listener for the same app inside the main server's event loop."""
    import uvicorn

    class _Quiet(uvicorn.Server):
        def capture_signals(self):  # the main server owns Ctrl-C and shutdown
            return nullcontext()

    global _server
    try:
        cert_p, key_p = await asyncio.to_thread(ensure_cert, ip)
        server = _server = _Quiet(uvicorn.Config(app, host="0.0.0.0", port=PORT, ssl_certfile=str(cert_p), ssl_keyfile=str(key_p),
                                       lifespan="off", log_level="warning", ws_ping_interval=20))
        state.update(running=True, error=None)
        await server.serve()
    except (Exception, SystemExit) as e:  # noqa: BLE001 - e.g. the port is taken: the http link keeps working
        state["error"] = f"secure link not started: {e!r}"
        log.warning(state["error"])
    finally:
        state["running"] = False


def stop() -> None:
    if _server is not None:
        _server.should_exit = True

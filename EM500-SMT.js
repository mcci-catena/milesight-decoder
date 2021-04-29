/*

Name:   EM500-SMT.js

Function:
    Decode Ursalink soil-monitoring port 85 messages for TTN console.

Copyright and License:
    See accompanying LICENSE file at https://github.com/mcci-catena/MCCI-Catena-PMS7003/

Author:
    Terry Moore, MCCI Corporation   September 2020

*/

// ttn v3 decoder
function decodeUplink(input)
    {
    return  { data: Decoder(input.bytes, input.fPort) };
    }

/**
 * Ursalink Sensor Payload Decoder
 *
 * definition [channel-id] [channel-type] [channel-data]
 *
 * 01: battery      -> 0x01 0x75 [1byte]   Unit:%
 * 03: Temperature  -> 0x03 0x67 [2bytes]  Unit:°C
 * 04: Moisture     -> 0x04 0x68 [1byte]   Unit:%RH
 * 05: Conductivity -> 0x05 0x7f [2bytes]  Unit:µs/cm
 * ------------------------------------------ EM500-SMT
 */
function Decoder(bytes, port) {
    var decoded = {};

    // accept either no port at all, or port 85
    if (! (port === undefined || port === 85)) {
        return null;
    }

    decoded.Error = false;
    for (var i = 0; i < bytes.length;) {
        // be robust
        if (i > bytes.length - 2) {
            // out of data.
            decoded.Error = true;
            break;
        }

        var channel_id = bytes[i++];
        var channel_type = bytes[i++];
        // BATTERY
        if (channel_id === 0x01 && channel_type === 0x75) {
            decoded.battery = bytes[i];
            i += 1;
        }
        // TEMPERATURE
        else if (channel_id === 0x03 && channel_type === 0x67) {
            decoded.temperature = readInt16LE(bytes.slice(i, i + 2)) / 10;
            i += 2;
        }
        // MOISTURE
        else if (channel_id === 0x04 && channel_type === 0x68) {
            decoded.humidity = bytes[i] / 2;
            i += 1;
        }
        // Electrical Conductivity
        else if (channel_id === 0x05 && channel_type === 0x7f) {
            decoded.conductivity= readInt16LE(bytes.slice(i, i + 2)) ;
            i += 2;
        }
        // SYSTEM
        else if (channel_id === 0xFF) {
            // FORMAT_VERSION
            if (channel_type === 0x01) {
                decoded.FormatVersion = bytes[i++];
                continue;
            }
            // HARDWARE_VERSION
            else if (channel_type === 0x09) {
                decoded.HardwareVersion = readVersion(bytes.slice(i, i+2));
                i += 2;
                continue;
            }
            // SOFTWARE_VERSION
            else if (channel_type === 0x0A) {
                decoded.SoftwareVersion = readVersion(bytes.slice(i, i+2));
                i += 2;
                continue;
            }
            // RESTART
            if (channel_type === 0x0B) {
                decoded.restart = 1;
                ++i;
                continue;
            }
            // POWER OFF
            if (channel_type === 0x0C) {
                decoded.shutdown = 1;
                ++i;
                continue;
            }
            // CLASS
            else if (channel_type === 0x0F) {
                decoded.Class = bytes[i++];
                continue;
            }
            // SERIAL_NUMBER
            else if (channel_type === 0x16) {
                decoded.SerialNumber = readHexBytes(bytes.slice(i, i+8));
                i += 8;
                continue;
            } else {
                decoded.Error = true;
                decoded.channel_id = channel_id;
                decoded.channel_type = channel_type;
                decoded.byte_position = i;
                decoded.ErrorType = "unknown channel type";
                break;
            }
        } else {
            decoded.Error = true;
            decoded.ErrorType = "unknown channel id";
            decoded.channel_id = channel_id;
            break;
        }
    }
    return decoded;
}
/* ******************************************
 * bytes to number
 ********************************************/
function readUInt16LE(bytes) {
    var value = (bytes[1] << 8) + bytes[0];
    return value & 0xffff;
}

function readInt16LE(bytes) {
    var ref = readUInt16LE(bytes);
    return ref > 0x7fff ? ref - 0x10000 : ref;
}

function readUInt16BE(bytes) {
    var value = (bytes[0] << 8) + bytes[1];
    return value;
}

function bcd2ToDecimal(value) {
    var result = value & 0xF;
    if (result > 9 || value >= 0xA0) {
        return 0;
    }
    return result + 10 * (value >> 4);
}

function bcd22ToVersion(value) {
    var result = bcd2ToDecimal(value >> 8) + (bcd2ToDecimal(value & 0xFF) / 100);
    return result;
}

function readVersion(bytes) {
    return bcd22ToVersion(readUInt16BE(bytes));
}

function encodeHex(byte) {
    return ("0" + byte.toString(16)).substr(-2);
}

function readHexBytes(bytes) {
    var result = "";
    for (var i = 0; i < bytes.length; ++i) {
        result = result + "-" + encodeHex(bytes[i]);
    }
    return result.substr(1);
}


// render input stream
const RenderInputStream = input => {
    let _position = 0,
        _column = 0,
        _line = 1;

    // return next value, discard from stream
    // advance to next extant (non-newline) character 
    const next = () => {
        const char = input.charAt(_position++);
        // newline encountered, increment line count and reset column counter
        if (char == "\n") {
            _line++;
            _column = 0;
        }
        // no newline, proceed to next char
        else {
            _column++;
        }
        return char;
    };

    // return next value, does not disrupt stream
    // artificially advance to next character
    const peek = () => input.charAt(_position);

    // returns true if and only if stream end
    const eof = () => peek() === "";

    // forcibly terminate, throwing an exception w/reference to source thereof
    const term = (reason, cause) => {
        throw new Error(`${reason} ${_line}:${_column} ${cause ? `(${cause})` : "" }`);
    };

    return {
        peek,
        next,
        eof,
        term
    };
};

module.exports = RenderInputStream;